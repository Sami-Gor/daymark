package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * V3 deterministic lifecycle regression tests: incumbent revocation, replacement
 * drain, stream-slot isolation, release failure and failed replacement.
 *
 * <p>These tests target the V2.1 native-lifecycle contract at the level of the
 * <em>process-wide native resources</em>, not merely one engine object's state
 * machine:
 *
 * <ul>
 *   <li>a newer reservation revokes the incumbent immediately, before any new
 *       native call (F2);</li>
 *   <li>a replacement must not enter native init/release while the incumbent's
 *       native call is on the stack (F2);</li>
 *   <li>a completion that belongs to a superseded generation must not publish
 *       READY and must not touch the shared native STREAM slot (F3);</li>
 *   <li>a release that throws is observable, is never retried blindly and
 *       blocks further native work until destruction is confirmed.</li>
 * </ul>
 *
 * <p>The {@link KokoroEngineTestSupport.FakeNative} models the bridge as it
 * really behaves: one live native instance per successful init, one
 * process-wide STREAM slot, and a release that destroys whatever instance is
 * live at call time. Every assertion therefore names a resource identity
 * (instance id, stream token) rather than a single global counter.
 *
 * <p>Ordering is driven by latches held inside the fake bridge's call sites.
 * No {@code Thread.sleep} is used. The one bounded wait
 * ({@link #REPLACEMENT_ENTRY_WINDOW_MS}) only decides whether a forbidden event
 * happened at all; it is a one-second observation window around an event that
 * a buggy implementation reaches in a handful of instructions.
 */
public class V3NativeLifecycleConcurrencyTest {

    private static final String EN = NarrationVoicePolicy.ENGLISH_VOICE;
    private static final String FR = NarrationVoicePolicy.FRENCH_VOICE;

    /**
     * Bounded window for "did the replacement enter native init while the
     * incumbent still held the bridge". A correct implementation never enters,
     * so the wait expires; the buggy baseline enters within microseconds.
     */
    private static final long REPLACEMENT_ENTRY_WINDOW_MS = 1000;

    /**
     * Rejection codes that mean "this engine no longer owns the native
     * resource" (or is no longer admissible because a newer generation exists).
     */
    private static final List<String> SUPERSEDED_CODES = Arrays.asList(
            "engine-superseded", "operation-conflict", "engine not ready",
            "engine-not-ready");

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private KokoroEngineTestSupport.Harness harness;

    @Before
    public void setUp() throws Exception {
        EngineOwnership.resetForTest();
        File root = temporaryFolder.newFolder("files");
        harness = new KokoroEngineTestSupport.Harness(root);
    }

    /* ------------------------------------------------------------------ *
     * 1. Immediate incumbent revocation (F2)                              *
     * ------------------------------------------------------------------ */

    @Test
    public void supersededReadyEngineRejectsNewSpeechBeforeAnyNativeCall() {
        harness.initializeReady();
        long incumbentGeneration = EngineOwnership.currentGeneration();
        harness.listener.clear();

        KokoroEngineTestSupport.ManualScheduler replacementScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener replacementListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine replacement = newEngine(replacementScheduler, replacementListener);
        replacement.initialize(replacementListener);
        long replacementReservation = EngineOwnership.reservedGeneration();
        assertTrue("a replacement must reserve a newer generation",
                replacementReservation > incumbentGeneration);

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllMain();

        assertSupersededRejection("speak after a newer reservation", harness.listener.errors);
        assertEquals("a rejected speak must not be queued",
                0, harness.scheduler.pendingWorker());
        assertEquals("a superseded engine must not start a native stream",
                0, harness.nativeApi.streamStartCalls);
        assertEquals("a superseded engine must not reach native synth",
                0, harness.nativeApi.synthCalls);
        assertFalse("a superseded engine must not publish SPEAKING",
                harness.listener.states.contains(LocalTtsEngine.State.SPEAKING));
        assertFalse("reserving a replacement must revoke the incumbent's ownership",
                EngineOwnership.owns(incumbentGeneration));
        assertEquals("the incumbent's instance is still the live one until the replacement inits",
                1, harness.nativeApi.activeInstanceId());
    }

    @Test
    public void supersededReadyEngineRejectsAReloadWithoutStealingTheReservation() {
        harness.initializeReady();
        harness.listener.clear();
        harness.assets.install(FR);

        KokoroEngineTestSupport.ManualScheduler replacementScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener replacementListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine replacement = newEngine(replacementScheduler, replacementListener);
        replacement.initialize(replacementListener);
        long replacementReservation = EngineOwnership.reservedGeneration();
        int initsBefore = harness.nativeApi.initCalls.size();

        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, capture);

        assertEquals("a superseded engine must reject the reload immediately",
                1, capture.errors.size());
        assertTrue("unexpected reload rejection: " + capture.errors,
                SUPERSEDED_CODES.contains(capture.lastError()));
        assertEquals("a superseded reload must not reserve another generation",
                replacementReservation, EngineOwnership.reservedGeneration());
        assertEquals("a rejected reload must not be queued",
                0, harness.scheduler.pendingWorker());
        assertEquals("a rejected reload must not init the native engine",
                initsBefore, harness.nativeApi.initCalls.size());
        assertFalse("a rejected reload must not publish LOADING",
                harness.listener.states.contains(LocalTtsEngine.State.LOADING));
        assertFalse(capture.succeeded());
    }

    /* ------------------------------------------------------------------ *
     * 2. Replacement must not touch the bridge during an active call (F2) *
     * ------------------------------------------------------------------ */

    @Test
    public void replacementDoesNotInitWhileTheIncumbentNativeStreamCallIsInFlight() {
        harness.initializeReady();
        int incumbentInstance = harness.nativeApi.activeInstanceId();
        final CountDownLatch streamEntered = new CountDownLatch(1);
        final CountDownLatch allowStreamResume = new CountDownLatch(1);
        harness.nativeApi.onStreamStart = new Runnable() {
            @Override
            public void run() {
                streamEntered.countDown();
                KokoroEngineTestSupport.awaitUnchecked(
                        allowStreamResume, "incumbent stream resume");
            }
        };

        harness.engine.speak("hello", "en-GB", null);
        AtomicReference<Throwable> incumbentFailure = new AtomicReference<>();
        Thread incumbent = KokoroEngineTestSupport.startDaemon(
                "v3-incumbent-stream", worker(harness.scheduler, incumbentFailure));
        KokoroEngineTestSupport.await(streamEntered, "the incumbent native stream call");

        KokoroEngineTestSupport.ManualScheduler replacementScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener replacementListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine replacement = newEngine(replacementScheduler, replacementListener);
        replacement.initialize(replacementListener);

        final CountDownLatch replacementInitEntered = new CountDownLatch(1);
        harness.nativeApi.onInit = new Runnable() {
            @Override
            public void run() {
                replacementInitEntered.countDown();
            }
        };
        AtomicReference<Throwable> replacementFailure = new AtomicReference<>();
        Thread replacementInit = KokoroEngineTestSupport.startDaemon(
                "v3-replacement-init",
                worker(replacementScheduler, replacementFailure));

        boolean enteredWhileIncumbentInFlight = KokoroEngineTestSupport.awaitQuietly(
                replacementInitEntered, REPLACEMENT_ENTRY_WINDOW_MS);

        // Let the incumbent finish, then the replacement may proceed.
        allowStreamResume.countDown();
        KokoroEngineTestSupport.joinOrFail(incumbent);
        KokoroEngineTestSupport.joinOrFail(replacementInit);
        replacementScheduler.runAllWorker();
        replacementScheduler.runAllMain();
        rethrow(incumbentFailure);
        rethrow(replacementFailure);

        assertFalse("a replacement entered native init while the incumbent's stream call "
                        + "was still on the stack",
                enteredWhileIncumbentInFlight);
        assertEquals("the replacement must commit READY after the incumbent drained",
                LocalTtsEngine.State.READY, replacementListener.lastState());
        assertTrue("the committed replacement must own the engine",
                EngineOwnership.owns(EngineOwnership.currentGeneration()));

        List<KokoroEngineTestSupport.NativeCall> calls = harness.nativeApi.callsSnapshot();
        int streamReturnIndex = lastIndexOfKind(calls, "streamStart-return");
        int replacementInitIndex = lastIndexOfKind(calls, "init");
        assertTrue("the replacement's init must follow the incumbent's stream call: " + calls,
                replacementInitIndex > streamReturnIndex);
        for (int i = 0; i < calls.size(); i += 1) {
            if ("release".equals(calls.get(i).kind)) {
                assertTrue("a replacement must not release the bridge while the incumbent's "
                                + "stream call is on the stack: " + calls.get(i),
                        i > streamReturnIndex);
            }
        }
        assertTrue("the replacement must have created a newer native instance",
                harness.nativeApi.activeInstanceId() > incumbentInstance);
    }

    /* ------------------------------------------------------------------ *
     * 3. Stale completion after a reservation (F3)                        *
     * ------------------------------------------------------------------ */

    @Test
    public void staleStreamCompletionAfterReservationPublishesNoReadyAndClearsNothing() {
        harness.initializeReady();
        long incumbentGeneration = EngineOwnership.currentGeneration();
        final CountDownLatch streamEntered = new CountDownLatch(1);
        final CountDownLatch allowStreamResume = new CountDownLatch(1);
        harness.nativeApi.onStreamStart = new Runnable() {
            @Override
            public void run() {
                streamEntered.countDown();
                KokoroEngineTestSupport.awaitUnchecked(
                        allowStreamResume, "incumbent stream resume");
            }
        };

        harness.engine.speak("hello", "en-GB", null);
        AtomicReference<Throwable> incumbentFailure = new AtomicReference<>();
        Thread incumbent = KokoroEngineTestSupport.startDaemon(
                "v3-stale-stream", worker(harness.scheduler, incumbentFailure));
        KokoroEngineTestSupport.await(streamEntered, "the incumbent native stream call");
        int clearsBefore = harness.nativeApi.streamClearCount;

        KokoroEngineTestSupport.ManualScheduler replacementScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener replacementListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine replacement = newEngine(replacementScheduler, replacementListener);
        replacement.initialize(replacementListener);
        assertTrue("the replacement must be reserved, not committed",
                EngineOwnership.reservedGeneration() > incumbentGeneration);
        harness.listener.clear();

        allowStreamResume.countDown();
        KokoroEngineTestSupport.joinOrFail(incumbent);
        harness.scheduler.runAllMain();
        rethrow(incumbentFailure);

        assertFalse("a stream that completes after a newer reservation must not publish READY",
                harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertEquals("a superseded completion must not touch the process-wide stream slot",
                clearsBefore, harness.nativeApi.streamClearCount);
        assertFalse("the superseded generation must not regain ownership",
                EngineOwnership.owns(incumbentGeneration));
        assertEquals("the superseded completion must not create a native instance",
                1, harness.nativeApi.successfulInitCalls);
        assertEquals("no release may follow a reservation-only completion",
                0, harness.nativeApi.releaseCount);
    }

    /* ------------------------------------------------------------------ *
     * 4. After replacement only the new generation may use the bridge     *
     * ------------------------------------------------------------------ */

    @Test
    public void afterReplacementOnlyTheNewGenerationInitiatesNativeWork() {
        harness.initializeReady();
        final CountDownLatch streamEntered = new CountDownLatch(1);
        final CountDownLatch allowStreamResume = new CountDownLatch(1);
        harness.nativeApi.onStreamStart = new Runnable() {
            @Override
            public void run() {
                streamEntered.countDown();
                KokoroEngineTestSupport.awaitUnchecked(
                        allowStreamResume, "incumbent stream resume");
            }
        };

        harness.engine.speak("hello", "en-GB", null);
        AtomicReference<Throwable> incumbentFailure = new AtomicReference<>();
        Thread incumbent = KokoroEngineTestSupport.startDaemon(
                "v3-drain-incumbent", worker(harness.scheduler, incumbentFailure));
        KokoroEngineTestSupport.await(streamEntered, "the incumbent native stream call");

        KokoroEngineTestSupport.ManualScheduler replacementScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener replacementListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine replacement = newEngine(replacementScheduler, replacementListener);
        replacement.initialize(replacementListener);

        allowStreamResume.countDown();
        KokoroEngineTestSupport.joinOrFail(incumbent);
        harness.scheduler.runAllMain();
        rethrow(incumbentFailure);
        replacementScheduler.runAllWorker();
        replacementScheduler.runAllMain();

        assertEquals("the replacement must become READY", LocalTtsEngine.State.READY,
                replacementListener.lastState());
        int replacementInstance = harness.nativeApi.activeInstanceId();
        int streamStartsAfterReplacement = harness.nativeApi.streamStartCalls;
        int releasesAtReplacement = harness.nativeApi.countCalls("release");
        int marker = lastSequence(harness.nativeApi);

        harness.listener.clear();
        harness.engine.speak("again", "en-GB", null);
        harness.scheduler.runAllMain();
        assertSupersededRejection("speak after replacement", harness.listener.errors);
        assertEquals("a superseded engine must not queue work",
                0, harness.scheduler.pendingWorker());

        harness.assets.install(FR);
        KokoroEngineTestSupport.Capture staleReload = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, staleReload);
        assertEquals("a superseded engine must reject a reload",
                1, staleReload.errors.size());
        assertTrue("unexpected reload rejection: " + staleReload.errors,
                SUPERSEDED_CODES.contains(staleReload.lastError()));
        assertEquals("a superseded reload must not init the replacement",
                replacementInstance, harness.nativeApi.activeInstanceId());
        assertEquals("a superseded reload must not queue work",
                0, harness.scheduler.pendingWorker());

        // The old instance's delayed cleanup (shutdown release task) runs now.
        harness.engine.shutdown();
        harness.scheduler.runAllWorker();
        harness.scheduler.runAllMain();

        assertEquals("an old cleanup must not release anything new",
                releasesAtReplacement, harness.nativeApi.countCalls("release"));
        assertFalse("an old cleanup must never release the replacement's instance",
                harness.nativeApi.releasedSnapshot().contains(replacementInstance));
        assertEquals("the replacement's native instance must stay live",
                replacementInstance, harness.nativeApi.activeInstanceId());
        assertTrue("the replacement must keep ownership",
                EngineOwnership.owns(EngineOwnership.currentGeneration()));
        assertEquals("the replacement must stay READY",
                LocalTtsEngine.State.READY, replacementListener.lastState());

        // From here on only the replacement may touch the bridge.
        harness.nativeApi.emitChunk(0.5f);
        replacementListener.clear();
        replacement.speak("hello", "en-GB", null);
        replacementScheduler.runAllWorker();
        replacementScheduler.runAllMain();

        assertEquals("the replacement must speak and finish",
                Arrays.asList(LocalTtsEngine.State.SPEAKING, LocalTtsEngine.State.READY),
                replacementListener.states);
        assertEquals("the replacement's stream must be the only new stream",
                streamStartsAfterReplacement + 1, harness.nativeApi.streamStartCalls);
        for (KokoroEngineTestSupport.NativeCall call : harness.nativeApi.callsSnapshot()) {
            if (call.sequence <= marker) {
                continue;
            }
            assertEquals("only the replacement may touch the native bridge after it commits: "
                            + call,
                    replacementInstance, call.instanceId);
            assertFalse("the replacement's instance must not be released: " + call,
                    "release".equals(call.kind));
        }
    }

    /* ------------------------------------------------------------------ *
     * 5. Old cleanup after a new commit                                   *
     * ------------------------------------------------------------------ */

    @Test
    public void oldCleanupAfterReplacementCommitCannotReleaseTheNewInstance() {
        harness.initializeReady();
        long incumbentGeneration = EngineOwnership.currentGeneration();

        // The incumbent decides to shut down, but its release task is queued.
        harness.engine.shutdown();
        assertEquals("the release must be deferred behind the replacement",
                1, harness.scheduler.pendingWorker());
        harness.scheduler.runAllMain();

        KokoroEngineTestSupport.ManualScheduler replacementScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener replacementListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine replacement = newEngine(replacementScheduler, replacementListener);
        replacement.initialize(replacementListener);
        replacementScheduler.runAllWorker();
        replacementScheduler.runAllMain();

        long replacementGeneration = EngineOwnership.currentGeneration();
        int replacementInstance = harness.nativeApi.activeInstanceId();
        int releasesAtReplacement = harness.nativeApi.countCalls("release");
        assertEquals("the replacement must become READY",
                LocalTtsEngine.State.READY, replacementListener.lastState());
        assertTrue("the replacement must own the engine",
                EngineOwnership.owns(replacementGeneration));

        // Now the old engine's delayed release task runs.
        harness.scheduler.runAllWorker();
        harness.scheduler.runAllMain();

        assertEquals("an old cleanup must not release anything new",
                releasesAtReplacement, harness.nativeApi.countCalls("release"));
        assertFalse("an old cleanup must never release the replacement's instance",
                harness.nativeApi.releasedSnapshot().contains(replacementInstance));
        assertEquals("the replacement's native instance must stay live",
                replacementInstance, harness.nativeApi.activeInstanceId());
        assertEquals("the replacement must keep the newest generation",
                replacementGeneration, EngineOwnership.currentGeneration());
        assertTrue(EngineOwnership.owns(replacementGeneration));
        assertEquals("the replacement must stay READY",
                LocalTtsEngine.State.READY, replacementListener.lastState());
        assertEquals("the replacement keeps its committed voice set",
                new HashSet<>(Arrays.asList(EN)), replacement.loadedVoices());
        assertFalse("the old generation must not become current again",
                EngineOwnership.owns(incumbentGeneration));
    }

    /* ------------------------------------------------------------------ *
     * 6. Process-wide STREAM slot isolation (F3)                          *
     * ------------------------------------------------------------------ */

    /**
     * V3 lease/deferred-drain contract: stream admission is gated by the
     * process-wide operation lease, and a stale cleanup from the first session
     * is token-checked against the second session's slot.
     *
     * <p>This replaces the pre-A expectation that two sessions could stream
     * concurrently on one engine. Under the generation-authoritative contract
     * a newer reservation revokes the incumbent immediately, the incumbent's
     * parked native call keeps the lease that gates the replacement's native
     * init, and the incumbent's completion runs against a retired stream token.
     */
    @Test
    public void staleStreamCleanupCannotClearASecondSessionsStreamSlot() {
        harness.initializeReady();
        final long firstGeneration = EngineOwnership.currentGeneration();
        final CountDownLatch firstInPlayback = new CountDownLatch(1);
        final CountDownLatch allowFirstResume = new CountDownLatch(1);
        final CountDownLatch secondInPlayback = new CountDownLatch(1);
        final CountDownLatch allowSecondResume = new CountDownLatch(1);
        final CountDownLatch secondWriteAgain = new CountDownLatch(1);
        final int[] secondWriteCount = {0};
        final long[] tokenAtSecondWrite = {0};
        harness.audio.writeHook = new KokoroEngineTestSupport.FakeAudioFactory.WriteHook() {
            @Override
            public void onWrite(KokoroEngineTestSupport.FakeHandle handle) {
                int index = harness.audio.handles.indexOf(handle);
                if (index == 0) {
                    firstInPlayback.countDown();
                    KokoroEngineTestSupport.awaitUnchecked(
                            allowFirstResume, "first session resume");
                } else if (index == 1) {
                    secondWriteCount[0] += 1;
                    if (secondWriteCount[0] == 1) {
                        secondInPlayback.countDown();
                        KokoroEngineTestSupport.awaitUnchecked(
                                allowSecondResume, "second session resume");
                    } else {
                        tokenAtSecondWrite[0] = harness.nativeApi.activeStreamToken();
                        secondWriteAgain.countDown();
                    }
                }
            }
        };
        harness.nativeApi.emitChunk(0.5f);

        // Session 1: the committed owner, parked inside an audio write while it
        // holds the process-wide operation lease and the native STREAM slot.
        harness.engine.speak("first", "en-GB", null);
        AtomicReference<Throwable> firstFailure = new AtomicReference<>();
        Thread first = KokoroEngineTestSupport.startDaemon(
                "v3-first-session", worker(harness.scheduler, firstFailure));
        KokoroEngineTestSupport.await(firstInPlayback, "the first session audio write");
        final long firstStreamToken = harness.nativeApi.activeStreamToken();
        final long firstOwnershipToken = ownershipStreamToken();
        assertTrue("the first session must own the shared stream slot",
                firstStreamToken > 0);
        assertTrue("the first session must own the process-wide stream token",
                EngineOwnership.isStreamCurrent(firstGeneration, firstOwnershipToken));

        // Session 2 (renderer recreation) reserves a newer generation. Its
        // native init is queued behind session 1's lease, so nothing may be
        // admitted: zero native inits and zero new stream starts.
        KokoroEngineTestSupport.ManualScheduler secondScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener secondListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine second = newEngine(secondScheduler, secondListener);
        second.initialize(secondListener);
        long secondGeneration = EngineOwnership.reservedGeneration();
        secondScheduler.drain();

        assertEquals("session 2 must not enter native init while the lease is held",
                1, harness.nativeApi.initCalls.size());
        assertEquals("session 2 must not start a native stream while the lease is held",
                1, harness.nativeApi.streamStartCalls);
        assertEquals("session 2 may only wait in LOADING",
                LocalTtsEngine.State.LOADING, secondListener.lastState());
        assertTrue("session 2 must hold the newest reservation",
                EngineOwnership.isAuthoritative(secondGeneration));
        assertFalse("session 2 must not own an uncommitted generation",
                EngineOwnership.owns(secondGeneration));
        assertFalse("the reservation already revoked session 1",
                EngineOwnership.owns(firstGeneration));
        assertEquals("session 1 must still hold the physical stream slot",
                firstStreamToken, harness.nativeApi.activeStreamToken());

        // A premature stream request from session 2 cannot acquire ownership
        // before its own init commits.
        second.speak("too-early", "en-GB", null);
        secondScheduler.runAllMain();
        assertEquals("session 2's premature stream request must be rejected",
                Arrays.asList("engine not ready"), secondListener.errors);
        assertEquals("a rejected stream request must not start a native stream",
                1, harness.nativeApi.streamStartCalls);
        assertEquals("a rejected stream request must not be queued",
                0, secondScheduler.pendingWorker());

        // Session 1 drains. Its completion carries the retired token and must
        // not clear or finish the shared slot; only then is session 2 admitted.
        allowFirstResume.countDown();
        KokoroEngineTestSupport.joinOrFail(first);
        harness.scheduler.runAllMain();
        rethrow(firstFailure);

        assertEquals("a revoked completion must not clear the shared stream slot",
                0, harness.nativeApi.streamClearCount);
        assertEquals("a revoked completion must not finish the shared stream",
                1, harness.nativeApi.streamFinishCalls);
        secondScheduler.drain();
        assertEquals("session 2 commits only after the lease drains",
                LocalTtsEngine.State.READY, secondListener.lastState());
        long committedSecondGeneration = EngineOwnership.currentGeneration();
        assertEquals("session 2 must commit its reservation",
                secondGeneration, committedSecondGeneration);
        assertTrue("session 2 must become the committed owner",
                EngineOwnership.owns(committedSecondGeneration));
        int secondInstance = harness.nativeApi.activeInstanceId();
        assertTrue("session 2 must have created a newer native instance",
                secondInstance > 0);

        // Session 2 is admitted and opens a NEW token.
        harness.nativeApi.emitChunk(0.5f);
        secondListener.clear();
        second.speak("second", "en-GB", null);
        AtomicReference<Throwable> secondFailure = new AtomicReference<>();
        Thread secondWorker = KokoroEngineTestSupport.startDaemon(
                "v3-second-session", worker(secondScheduler, secondFailure));
        KokoroEngineTestSupport.await(secondInPlayback, "the second session audio write");
        final long secondStreamToken = harness.nativeApi.activeStreamToken();
        final long secondOwnershipToken = ownershipStreamToken();
        assertTrue("session 2 must own a new stream token", secondStreamToken > 0);
        assertTrue("session 2's token must differ from the retired token",
                secondStreamToken != firstStreamToken);
        assertTrue("session 2's ownership token must differ from the retired one",
                secondOwnershipToken != firstOwnershipToken);
        assertTrue("session 2's ownership token must be current",
                EngineOwnership.isStreamCurrent(
                        committedSecondGeneration, secondOwnershipToken));

        // Deliver session 1's delayed cleanup/completion while session 2 is
        // parked mid-playback. Shutdown's release task runs but must park on
        // session 2's lease; the stale stream cleanup must be token-checked.
        harness.listener.clear();
        harness.engine.shutdown();
        harness.scheduler.runAllWorker();
        harness.scheduler.runAllMain();

        assertEquals("a stale shutdown release must not free session 2's instance",
                0, harness.nativeApi.releaseCount);
        assertEquals("session 2's native instance must stay live",
                secondInstance, harness.nativeApi.activeInstanceId());
        assertEquals("session 2's stream slot must survive the stale cleanup",
                secondStreamToken, harness.nativeApi.activeStreamToken());
        assertEquals("a stale cleanup must not clear session 2's stream",
                0, harness.nativeApi.countCalls("streamClear", (int) secondStreamToken));
        assertFalse("the old session must not publish READY after shutdown",
                harness.listener.states.contains(LocalTtsEngine.State.READY));

        // Simulate the delayed stream completion reaching session 1's real
        // cleanup method with its retired token after session 2 owns the slot.
        // The engine normally cannot reach this path spuriously (the lease
        // serialises admission), so the test invokes the production cleanup
        // directly to prove the token check, exactly like nativeInstanceLive
        // is read reflectively elsewhere in this support.
        invokeDelayedStreamCleanup(harness.engine, firstGeneration, firstOwnershipToken);
        assertEquals("a delayed stale cleanup must not clear session 2's stream",
                0, harness.nativeApi.countCalls("streamClear", (int) secondStreamToken));
        assertEquals("session 2's ownership token must not be replaced by a stale close",
                secondOwnershipToken, ownershipStreamToken());
        assertFalse("the ownership guard must reject the retired token",
                EngineOwnership.closeStream(firstGeneration, firstOwnershipToken));
        assertTrue("session 2's ownership token must remain current after the stale cleanup",
                EngineOwnership.isStreamCurrent(
                        committedSecondGeneration, secondOwnershipToken));

        // Session 2 continues writing audio after the stale cleanup arrived.
        harness.nativeApi.emitChunk(0.5f);
        allowSecondResume.countDown();
        KokoroEngineTestSupport.await(secondWriteAgain,
                "the second session's continued audio write");
        assertTrue("session 2 must keep writing audio after the stale cleanup",
                secondWriteCount[0] >= 2);
        assertEquals("session 2's token must be live during the continued write",
                secondStreamToken, tokenAtSecondWrite[0]);

        KokoroEngineTestSupport.joinOrFail(secondWorker);
        secondScheduler.runAllMain();
        rethrow(secondFailure);

        assertEquals("only session 2's own cleanup may clear its stream",
                1, harness.nativeApi.countCalls("streamClear", (int) secondStreamToken));
        assertEquals("the retired token must never reach the native clear",
                0, harness.nativeApi.countCalls("streamClear", (int) firstStreamToken));
        assertEquals("the old shutdown release must never free session 2's instance",
                0, harness.nativeApi.releaseCount);
        assertEquals("session 2 must stay the live instance",
                secondInstance, harness.nativeApi.activeInstanceId());
        assertEquals("session 2 must end READY on its own completion",
                LocalTtsEngine.State.READY, secondListener.lastState());

        second.shutdown();
        secondScheduler.drain();
        assertEquals("the committed owner releases exactly once",
                1, harness.nativeApi.releaseCount);
        assertEquals("the release must target session 2's instance",
                Arrays.asList(secondInstance), harness.nativeApi.releasedSnapshot());
        assertEquals("no release may ever run without a live instance",
                0, harness.nativeApi.releaseWithoutInstance);
    }

    /* ------------------------------------------------------------------ *
     * 7. Shutdown during active synthesis                                 *
     * ------------------------------------------------------------------ */

    /**
     * V3 deferred-drain contract: shutdown during an active, leased synthesis
     * must not free the process-global engine underneath the native call, and
     * must not publish READY for work it no longer owns.
     *
     * <p>This replaces the pre-A expectation that shutdown released the live
     * instance immediately while a stream call was still on the stack. Under
     * the lease contract the release waits for the last admitted operation: it
     * is zero while parked and exactly one after the operation drains.
     */
    @Test
    public void shutdownDuringActiveSynthesisRejectsNewWorkAndNeverPublishesReady() {
        harness.initializeReady();
        final int liveInstance = harness.nativeApi.activeInstanceId();
        final CountDownLatch streamEntered = new CountDownLatch(1);
        final CountDownLatch allowStreamResume = new CountDownLatch(1);
        harness.nativeApi.onStreamStart = new Runnable() {
            @Override
            public void run() {
                streamEntered.countDown();
                KokoroEngineTestSupport.awaitUnchecked(
                        allowStreamResume, "incumbent stream resume");
            }
        };

        harness.engine.speak("hello", "en-GB", null);
        AtomicReference<Throwable> workerFailure = new AtomicReference<>();
        Thread worker = KokoroEngineTestSupport.startDaemon(
                "v3-shutdown-synthesis", worker(harness.scheduler, workerFailure));
        KokoroEngineTestSupport.await(streamEntered, "the active native stream call");
        harness.listener.clear();
        int initsBeforeShutdown = harness.nativeApi.initCalls.size();
        int streamsBeforeShutdown = harness.nativeApi.streamStartCalls;

        harness.engine.shutdown();
        // Run the queued release task: it must observe the active lease and
        // queue itself behind it instead of releasing the live instance.
        harness.scheduler.runWorker();
        assertEquals("the native release must be deferred while the lease is held",
                0, harness.nativeApi.releaseCount);
        assertEquals("the live instance must survive the parked shutdown",
                liveInstance, harness.nativeApi.activeInstanceId());
        assertEquals("the deferred release must not run without a live instance",
                0, harness.nativeApi.releaseWithoutInstance);

        harness.engine.speak("again", "en-GB", null);
        // Release builds do not package optional voices, so install the file
        // explicitly and let the request reach the shutdown gate instead of
        // stopping at voice-not-installed.
        harness.assets.install(FR);
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, capture);
        harness.scheduler.runAllMain();
        assertEquals("a shut-down engine must reject new speech",
                Arrays.asList("engine-shutdown"), harness.listener.errors);
        assertEquals("a shut-down engine must reject a reload",
                Arrays.asList("engine-shutdown"), capture.errors);
        assertFalse("a shut-down engine must not report a reload success",
                capture.succeeded());
        assertEquals("a shut-down engine must not queue work",
                0, harness.scheduler.pendingWorker());
        assertEquals("no init may run after shutdown",
                initsBeforeShutdown, harness.nativeApi.initCalls.size());
        assertEquals("no stream may start after shutdown",
                streamsBeforeShutdown, harness.nativeApi.streamStartCalls);
        assertFalse("no READY may be published for revoked work",
                harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertTrue("shutdown loads no voice", harness.engine.loadedVoices().isEmpty());
        assertEquals("shutdown is terminal",
                LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());

        // Resume the parked operation: it returns revoked, the lease drains,
        // and only then does exactly one release target the live instance.
        allowStreamResume.countDown();
        KokoroEngineTestSupport.joinOrFail(worker);
        harness.scheduler.runAllMain();
        rethrow(workerFailure);

        assertEquals("the deferred release runs exactly once after the drain",
                1, harness.nativeApi.releaseCount);
        assertEquals("the release must target the one live native instance",
                Arrays.asList(liveInstance), harness.nativeApi.releasedSnapshot());
        assertEquals("exactly one successful init produced the released instance",
                1, harness.nativeApi.successfulInitCalls);
        assertEquals("no native instance may stay live after shutdown",
                0, harness.nativeApi.activeInstanceId());
        assertEquals("a release must never run without a live instance",
                0, harness.nativeApi.releaseWithoutInstance);
        assertEquals("a revoked completion must not finish the stream",
                0, harness.nativeApi.streamFinishCalls);
        assertEquals("a revoked completion must not clear the stream",
                0, harness.nativeApi.streamClearCount);
        assertFalse("an active synthesis must not publish READY after shutdown",
                harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertEquals("shutdown is terminal",
                LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());
        assertEquals("no stale success callback after shutdown",
                0, capture.successes.size());
        assertEquals("no new native instance may be created",
                1, harness.nativeApi.successfulInitCalls);
        assertFalse(EngineOwnership.owns(EngineOwnership.currentGeneration()));

        harness.scheduler.drain();
        assertEquals("no second release may follow the deferred release",
                1, harness.nativeApi.releaseCount);
    }

    /* ------------------------------------------------------------------ *
     * 8. Release failure (release-unconfirmed)                            *
     * ------------------------------------------------------------------ */

    @Test
    public void releaseFailureIsObservableAndIsNotRetriedBlindly() {
        harness.initializeReady();
        harness.nativeApi.releaseThrows = true;

        harness.engine.shutdown();
        harness.scheduler.drain();

        assertEquals("exactly one release attempt", 1, harness.nativeApi.releaseCount);
        assertEquals("the release targeted the incumbent instance",
                Arrays.asList(1), harness.nativeApi.releasedSnapshot());
        assertTrue("a failed release must be observable as release-unconfirmed",
                releaseFailureObservable());
        assertFalse("a failed release must not leave the instance eligible",
                KokoroEngineTestSupport.nativeInstanceLive(harness.engine));
        assertEquals("shutdown remains terminal after a failed release",
                LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());

        harness.engine.shutdown();
        harness.scheduler.drain();
        assertEquals("a failed release must never be retried blindly",
                1, harness.nativeApi.releaseCount);
        assertEquals("a release must never be attempted without a live instance",
                0, harness.nativeApi.releaseWithoutInstance);
        assertTrue("no native instance may be destroyed twice",
                harness.nativeApi.releasedSnapshot().size() <= 1);

        // The unconfirmed release also blocks further work on the same engine.
        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllMain();
        assertEquals("a release-unconfirmed engine must reject new speech",
                Arrays.asList("engine-shutdown"), harness.listener.errors);
        assertEquals("a release-unconfirmed engine must not queue work",
                0, harness.scheduler.pendingWorker());
    }

    @Test
    public void releaseFailureBlocksNewNativeWorkUntilDestructionIsConfirmed() {
        harness.initializeReady();
        harness.nativeApi.releaseThrows = true;

        harness.engine.shutdown();
        harness.scheduler.drain();
        assertEquals("exactly one release attempt", 1, harness.nativeApi.releaseCount);
        int initCallsAfterFailedRelease = harness.nativeApi.initCalls.size();

        // A replacement engine must not build native state on top of an engine
        // whose destruction was never confirmed.
        KokoroEngineTestSupport.ManualScheduler replacementScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener replacementListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine replacement = newEngine(replacementScheduler, replacementListener);
        replacement.initialize(replacementListener);
        replacementScheduler.drain();

        assertEquals("no new native instance may be created while release is unconfirmed",
                initCallsAfterFailedRelease, harness.nativeApi.initCalls.size());
        assertFalse("no READY may be published while release is unconfirmed",
                replacementListener.states.contains(LocalTtsEngine.State.READY));
        assertFalse("an unconfirmed release must not grant ownership",
                EngineOwnership.owns(EngineOwnership.currentGeneration()));
        assertEquals("the unconfirmed release must not be retried by the replacement",
                1, harness.nativeApi.releaseCount);
    }

    /* ------------------------------------------------------------------ *
     * 9. Failed replacement / failed restore                              *
     * ------------------------------------------------------------------ */

    @Test
    public void failedReplacementDoesNotRestoreStaleOwnershipToTheIncumbent() {
        harness.initializeReady();
        long incumbentGeneration = EngineOwnership.currentGeneration();
        harness.listener.clear();
        int successfulInitsBefore = harness.nativeApi.successfulInitCalls;

        KokoroEngineTestSupport.ManualScheduler replacementScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener replacementListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine replacement = newEngine(replacementScheduler, replacementListener);
        replacement.initialize(replacementListener);
        harness.nativeApi.failAll = true;
        replacementScheduler.drain();

        assertEquals("the replacement must not claim a successful init",
                successfulInitsBefore, harness.nativeApi.successfulInitCalls);
        assertEquals("a failed replacement ends in ERROR",
                LocalTtsEngine.State.ERROR, replacementListener.lastState());
        assertFalse("a failed replacement must never publish READY",
                replacementListener.states.contains(LocalTtsEngine.State.READY));
        assertFalse("a failed replacement must not leave a native owner",
                EngineOwnership.owns(EngineOwnership.currentGeneration()));
        assertFalse("a reservation must revoke the incumbent even if the replacement fails",
                EngineOwnership.owns(incumbentGeneration));

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllMain();
        assertSupersededRejection("speak after a failed replacement", harness.listener.errors);
        assertEquals("a failed replacement must not allow stale native work",
                0, harness.scheduler.pendingWorker());
        assertEquals("the incumbent must not re-init the failed replacement's engine",
                successfulInitsBefore, harness.nativeApi.successfulInitCalls);
    }

    @Test
    public void failedReplacementAndRestoreLeaveNoOwnershipAndNoFalseReady() {
        harness.initializeReady();
        long incumbentGeneration = EngineOwnership.currentGeneration();
        harness.assets.install(FR);
        harness.listener.clear();
        harness.nativeApi.failAll = true;

        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, capture);
        harness.scheduler.drain();

        assertEquals("an unrecovered reload reports exactly one failure",
                1, capture.errors.size());
        assertEquals("reload-failed-unrecovered", capture.lastError());
        assertEquals("an unrecovered reload ends in ERROR",
                LocalTtsEngine.State.ERROR, harness.listener.lastState());
        assertFalse("an unrecovered reload must not publish READY",
                harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertTrue("an unrecovered reload loads no voice",
                harness.engine.loadedVoices().isEmpty());
        assertFalse("an unrecovered reload must not keep stale ownership",
                EngineOwnership.owns(incumbentGeneration));
        assertEquals("exactly one release per successful native init",
                harness.nativeApi.successfulInitCalls, harness.nativeApi.releaseCount);

        // A retry may reserve a fresh generation, but only its own commit may
        // publish READY.
        harness.nativeApi.failAll = false;
        harness.engine.initialize(harness.listener);
        harness.scheduler.runAllMain();
        assertEquals("a retry is LOADING until its own native init commits",
                LocalTtsEngine.State.LOADING, harness.listener.lastState());
        harness.scheduler.runAllWorker();
        harness.scheduler.runAllMain();
        assertEquals("a successful retry commits READY",
                LocalTtsEngine.State.READY, harness.listener.lastState());
        assertTrue("a successful retry owns the engine",
                EngineOwnership.owns(EngineOwnership.currentGeneration()));
        assertEquals(new HashSet<>(Arrays.asList(EN)),
                new HashSet<>(harness.engine.loadedVoices()));
    }

    /* ------------------------------------------------------------------ *
     * Helpers                                                             *
     * ------------------------------------------------------------------ */

    private KokoroLocalTtsEngine newEngine(
            KokoroEngineTestSupport.ManualScheduler scheduler,
            KokoroEngineTestSupport.RecordingListener listener) {
        return harness.newEngine(scheduler, listener);
    }

    private static Runnable worker(
            final KokoroEngineTestSupport.ManualScheduler scheduler,
            final AtomicReference<Throwable> failure) {
        return new Runnable() {
            @Override
            public void run() {
                try {
                    scheduler.runWorker();
                } catch (Throwable error) {
                    failure.set(error);
                }
            }
        };
    }

    private static void rethrow(AtomicReference<Throwable> failure) {
        if (failure.get() != null) {
            throw new AssertionError("worker task failed", failure.get());
        }
    }

    private static void assertSupersededRejection(String what, List<String> errors) {
        assertEquals(what + ": exactly one rejection", 1, errors.size());
        assertTrue(what + ": expected a superseded/conflict rejection but was " + errors,
                SUPERSEDED_CODES.contains(errors.get(0)));
    }

    /**
     * Delivers a stale stream completion through the engine's real cleanup
     * method. Production cannot reach this path for a revoked generation
     * spontaneously (admission is lease-serialised), so the test invokes the
     * private seam with the retired token to prove that the cleanup is
     * token-checked and never clears a newer session's shared slot.
     */
    private static void invokeDelayedStreamCleanup(
            KokoroLocalTtsEngine engine, long generation, long streamToken) {
        try {
            java.lang.reflect.Method closeStream = KokoroLocalTtsEngine.class
                    .getDeclaredMethod("closeStream", long.class, long.class);
            closeStream.setAccessible(true);
            closeStream.invoke(engine, generation, streamToken);
        } catch (ReflectiveOperationException failure) {
            throw new AssertionError(
                    "cannot invoke the engine's delayed stream cleanup", failure);
        }
    }

    /**
     * Reads the guard's current stream token. The engine keeps its token
     * privately; the test needs the real ownership token to prove that the
     * retired session-1 token (not an unrelated number) is rejected after
     * session 2 owns the slot.
     */
    private static long ownershipStreamToken() {
        try {
            java.lang.reflect.Field epoch =
                    EngineOwnership.class.getDeclaredField("streamEpoch");
            epoch.setAccessible(true);
            return epoch.getLong(null);
        } catch (ReflectiveOperationException failure) {
            throw new AssertionError("cannot read the ownership stream token", failure);
        }
    }

    private static int lastSequence(KokoroEngineTestSupport.FakeNative nativeApi) {
        List<KokoroEngineTestSupport.NativeCall> calls = nativeApi.callsSnapshot();
        return calls.isEmpty() ? 0 : calls.get(calls.size() - 1).sequence;
    }

    private static int lastIndexOfKind(
            List<KokoroEngineTestSupport.NativeCall> calls, String kind) {
        for (int i = calls.size() - 1; i >= 0; i -= 1) {
            if (kind.equals(calls.get(i).kind)) {
                return i;
            }
        }
        return -1;
    }

    /**
     * True when the failed release is observable as "release-unconfirmed":
     * either a stable diagnostic line, or (once production exposes it) a
     * boolean lifecycle accessor on the engine or the ownership guard.
     */
    private boolean releaseFailureObservable() {
        for (String line : concatenate(harness.log.errors, harness.log.warnings)) {
            if (line == null) {
                continue;
            }
            String lower = line.toLowerCase(Locale.ROOT);
            if (lower.contains("release")
                    && (lower.contains("unconfirmed")
                    || lower.contains("failed")
                    || lower.contains("failure"))) {
                return true;
            }
        }
        return booleanAccessorReportsTrue(KokoroLocalTtsEngine.class, harness.engine)
                || booleanAccessorReportsTrue(EngineOwnership.class, null);
    }

    private static List<String> concatenate(List<String> first, List<String> second) {
        List<String> all = new ArrayList<>(first);
        all.addAll(second);
        return all;
    }

    private static boolean booleanAccessorReportsTrue(Class<?> type, Object target) {
        Method[] methods;
        try {
            methods = type.getDeclaredMethods();
        } catch (SecurityException denied) {
            return false;
        }
        for (Method method : methods) {
            if (method.getParameterCount() != 0 || method.getReturnType() != boolean.class) {
                continue;
            }
            String name = method.getName().toLowerCase(Locale.ROOT);
            if (!name.contains("unconfirmed") && !name.contains("releasefailed")) {
                continue;
            }
            try {
                method.setAccessible(true);
                Object result = Modifier.isStatic(method.getModifiers())
                        ? method.invoke(null)
                        : method.invoke(target);
                if (Boolean.TRUE.equals(result)) {
                    return true;
                }
            } catch (ReflectiveOperationException | RuntimeException ignored) {
                // Optional future seam: fall back to the diagnostic channel.
            }
        }
        return false;
    }
}
