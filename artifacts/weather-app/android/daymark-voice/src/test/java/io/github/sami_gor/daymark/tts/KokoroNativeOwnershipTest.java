package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.util.Arrays;
import java.util.HashSet;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * V3 native ownership regressions: F2 (reservation revokes the incumbent),
 * F3 (every native synth/stream call is admitted under a lease and re-checked),
 * the operation-lease drain, the global stream token and L1 (a post-shutdown
 * commit cannot repopulate {@code loadedVoices}).
 *
 * <p>Each scenario is deterministic: the fake native bridge holds one call on a
 * latch, a second engine reserves/tears down, and the test releases the latch
 * only after asserting the state the ordering is meant to prove.
 */
public class KokoroNativeOwnershipTest {

    private static final String EN = NarrationVoicePolicy.ENGLISH_VOICE;
    private static final String FR = NarrationVoicePolicy.FRENCH_VOICE;

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
     * F2: the reservation itself revokes the incumbent                    *
     * ------------------------------------------------------------------ */

    @Test
    public void reservationRevokesTheIncumbentBeforeTheReplacementInitRuns() {
        harness.initializeReady();
        final long incumbentGeneration = EngineOwnership.currentGeneration();
        harness.listener.clear();

        KokoroEngineTestSupport.ManualScheduler secondScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener secondListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine second = new KokoroLocalTtsEngine(
                secondScheduler, harness.assets, harness.audio,
                harness.nativeApi, harness.log, harness.clock);

        // Reserve only: the replacement worker has not run nativeInit yet.
        second.initialize(secondListener);
        secondScheduler.runAllMain();
        assertEquals(LocalTtsEngine.State.LOADING, secondListener.lastState());
        assertEquals("no native init yet", 1, harness.nativeApi.initCalls.size());

        assertFalse("F2: the incumbent is revoked by the reservation itself",
                EngineOwnership.owns(incumbentGeneration));
        assertFalse(EngineOwnership.isAuthoritative(incumbentGeneration));

        // The incumbent cannot speak or reload into the reserved window.
        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllMain();
        assertEquals(Arrays.asList("engine-superseded"), harness.listener.errors);
        assertEquals(0, harness.nativeApi.streamStartCalls);

        harness.assets.install(FR);
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, capture);
        assertEquals("engine-superseded", capture.lastError());
        assertEquals(1, harness.nativeApi.initCalls.size());

        // The replacement commits and becomes the only owner.
        secondScheduler.drain();
        assertEquals(LocalTtsEngine.State.READY, secondListener.lastState());
        assertEquals(2, harness.nativeApi.initCalls.size());
        assertTrue(EngineOwnership.owns(EngineOwnership.currentGeneration()));

        second.shutdown();
        secondScheduler.drain();
        harness.engine.shutdown();
        harness.scheduler.drain();
        assertEquals("the superseded instance must not release the replacement",
                1, harness.nativeApi.releaseCount);
    }

    /* ------------------------------------------------------------------ *
     * F3 + drain: replacement init waits for an in-flight native call     *
     * ------------------------------------------------------------------ */

    @Test
    public void replacementNativeInitWaitsForTheIncumbentStreamToDrain() throws Exception {
        harness.initializeReady();
        final long incumbentGeneration = EngineOwnership.currentGeneration();
        harness.listener.clear();

        final CountDownLatch streamEntered = new CountDownLatch(1);
        final CountDownLatch allowStreamResume = new CountDownLatch(1);
        harness.nativeApi.onStreamStart = new Runnable() {
            @Override
            public void run() {
                streamEntered.countDown();
                awaitUnchecked(allowStreamResume);
            }
        };

        harness.engine.speak("hello world", "en-GB", null);
        harness.scheduler.runAllMain();
        AtomicReference<Throwable> streamFailure = new AtomicReference<>();
        Thread stream = startWorker("v3-incumbent-stream", streamFailure);
        await(streamEntered);

        KokoroEngineTestSupport.ManualScheduler secondScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener secondListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine second = new KokoroLocalTtsEngine(
                secondScheduler, harness.assets, harness.audio,
                harness.nativeApi, harness.log, harness.clock);
        second.initialize(secondListener);
        secondScheduler.drain();

        assertEquals("F3: replacement init must not run while nativeStreamStart is on the stack",
                1, harness.nativeApi.initCalls.size());
        assertEquals(LocalTtsEngine.State.LOADING, secondListener.lastState());
        assertFalse(EngineOwnership.owns(incumbentGeneration));

        // The revoked stream completes. It must not finish or clear the global
        // stream slot, and it must not publish anything for the old instance.
        allowStreamResume.countDown();
        joinWorker(stream, streamFailure);
        assertEquals(0, harness.nativeApi.streamFinishCalls);
        assertEquals("a stale stream may not clear the token it no longer owns",
                0, harness.nativeApi.streamClearCount);
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));

        // The queued replacement init now runs from the draining thread.
        secondScheduler.drain();
        assertEquals(LocalTtsEngine.State.READY, secondListener.lastState());
        assertEquals(2, harness.nativeApi.initCalls.size());
        assertEquals(EN, harness.nativeApi.initCalls.get(1));
        assertTrue("the replacement owns the committed generation",
                EngineOwnership.owns(EngineOwnership.currentGeneration()));

        harness.nativeApi.emitChunk(0.5f, 0.5f);
        secondListener.clear();
        second.speak("hello", "en-GB", null);
        secondScheduler.drain();
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.SPEAKING, LocalTtsEngine.State.READY),
                secondListener.states);

        second.shutdown();
        secondScheduler.drain();
        harness.engine.shutdown();
        harness.scheduler.drain();
        assertEquals("only the committed replacement releases the native engine",
                1, harness.nativeApi.releaseCount);
    }

    @Test
    public void aRevokedSynthResultIsDiscardedAndNeverPlayed() throws Exception {
        harness.initializeReady();
        harness.nativeApi.streamStartError = "stream disabled";
        final CountDownLatch synthEntered = new CountDownLatch(1);
        final CountDownLatch allowSynthResume = new CountDownLatch(1);
        harness.nativeApi.onSynth = new Runnable() {
            @Override
            public void run() {
                synthEntered.countDown();
                awaitUnchecked(allowSynthResume);
            }
        };

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllMain();
        AtomicReference<Throwable> synthFailure = new AtomicReference<>();
        Thread synth = startWorker("v3-incumbent-synth", synthFailure);
        await(synthEntered);

        // A newer instance revokes the generation while nativeSynth is on the
        // stack. The old result must not be converted into audio.
        KokoroEngineTestSupport.ManualScheduler secondScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener secondListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine second = new KokoroLocalTtsEngine(
                secondScheduler, harness.assets, harness.audio,
                harness.nativeApi, harness.log, harness.clock);
        second.initialize(secondListener);
        secondScheduler.drain();

        allowSynthResume.countDown();
        joinWorker(synth, synthFailure);
        secondScheduler.drain();

        assertEquals("the revoked synth result must not open an AudioTrack",
                0, harness.audio.openCount);
        assertEquals(LocalTtsEngine.State.READY, secondListener.lastState());
        second.shutdown();
        secondScheduler.drain();
        harness.engine.shutdown();
        harness.scheduler.drain();
    }

    /* ------------------------------------------------------------------ *
     * L1: loadedVoices is cleared atomically with the shutdown transition *
     * ------------------------------------------------------------------ */

    @Test
    public void shutdownClearsLoadedVoicesBeforeAnyWorkerDrains() {
        harness.initializeReady();
        assertEquals(new HashSet<>(Arrays.asList(EN)), harness.loaded());

        // No scheduler drain: clearing must be part of the terminal
        // transition, not something a later worker task performs.
        harness.engine.shutdown();
        assertTrue("L1: loadedVoices is cleared with the shutdown transition",
                harness.engine.loadedVoices().isEmpty());

        // A stale commit that runs after shutdown must be refused.
        assertFalse(harness.engine.publishLoadedVoices(
                new HashSet<>(Arrays.asList(FR))));
        assertTrue(harness.engine.loadedVoices().isEmpty());

        harness.scheduler.drain();
        assertEquals(1, harness.nativeApi.releaseCount);
        assertTrue(harness.engine.loadedVoices().isEmpty());
    }

    @Test
    public void aReloadCommitThatLosesToShutdownCannotRepopulateLoadedVoices() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.listener.clear();
        // Shutdown lands while the replacement native init is on the stack,
        // i.e. after the replacement reserved but before it could commit.
        harness.nativeApi.onInit = new Runnable() {
            @Override
            public void run() {
                harness.engine.shutdown();
            }
        };
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, capture);
        harness.scheduler.drain();

        assertEquals("engine-shutdown", capture.lastError());
        assertFalse(capture.succeeded());
        assertTrue("a commit that loses to shutdown must not repopulate the set",
                harness.engine.loadedVoices().isEmpty());
        assertEquals(LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));
        // One release for the old committed instance, one for the replacement
        // created by the interruptible reload; never a release for a tombstone.
        assertEquals(harness.nativeApi.successfulInitCalls,
                harness.nativeApi.releaseCount);
        assertFalse(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    /* ------------------------------------------------------------------ *
     * Deterministic thread helpers (no sleep, bounded waits)              *
     * ------------------------------------------------------------------ */

    private Thread startWorker(final String name, final AtomicReference<Throwable> failure) {
        Thread thread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    harness.scheduler.runWorker();
                } catch (Throwable error) {
                    failure.set(error);
                }
            }
        }, name);
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    private static void joinWorker(Thread thread, AtomicReference<Throwable> failure) {
        try {
            thread.join(5000);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            fail("interrupted while joining " + thread.getName());
        }
        assertFalse("worker thread did not finish: " + thread.getName(), thread.isAlive());
        if (failure.get() != null) {
            throw new AssertionError("worker task failed: " + thread.getName(), failure.get());
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            assertTrue("timed out waiting for native ordering",
                    latch.await(5, TimeUnit.SECONDS));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            fail("interrupted while waiting for native ordering");
        }
    }

    private static void awaitUnchecked(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("timed out waiting inside a native hook");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("interrupted inside a native hook", interrupted);
        }
    }
}
