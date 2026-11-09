package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * V3: deterministic two-generation interleavings.
 *
 * <p>Every scenario starts with a committed incumbent (generation A) whose
 * native stream call is parked inside the bridge, then executes a fixed,
 * explicitly ordered sequence of replacement-reservation, incumbent-completion,
 * replacement-init and incumbent-cleanup steps. Nothing is timed: the
 * incumbent is released from the fake bridge only when the scenario says so and
 * every worker runs on a named thread that is joined before the next step.
 *
 * <p>The invariants are generation-scoped:
 * <ul>
 *   <li>a superseded instance never publishes READY after a newer reservation;</li>
 *   <li>a release always targets a live instance, exactly once;</li>
 *   <li>the incumbent's cleanup never destroys the replacement's instance;</li>
 *   <li>the replacement ends up as the single committed owner.</li>
 * </ul>
 */
public class V3TwoGenerationInterleavingTest {

    /** One deterministic step in a two-generation interleaving. */
    private enum Step {
        /** A newer engine object reserves the next generation (worker not run). */
        REPLACEMENT_RESERVED,
        /** The incumbent's parked native stream call returns and its op finishes. */
        INCUMBENT_COMPLETES,
        /** The replacement's queued initialisation runs to commit/READY. */
        REPLACEMENT_INIT,
        /** The incumbent shuts down and its queued release task runs. */
        INCUMBENT_CLEANUP,
        /** The replacement speaks and must be the only engine touching the bridge. */
        REPLACEMENT_STREAM
    }

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private KokoroEngineTestSupport.Harness harness;

    @Before
    public void setUp() throws Exception {
        EngineOwnership.resetForTest();
        File root = temporaryFolder.newFolder("files");
        harness = new KokoroEngineTestSupport.Harness(root);
    }

    @Test
    public void replacementCommitsBeforeIncumbentCleanup() {
        runScenario(
                Step.REPLACEMENT_RESERVED,
                Step.INCUMBENT_COMPLETES,
                Step.REPLACEMENT_INIT,
                Step.INCUMBENT_CLEANUP);
    }

    @Test
    public void incumbentCleanupRunsBeforeReplacementInit() {
        runScenario(
                Step.REPLACEMENT_RESERVED,
                Step.INCUMBENT_COMPLETES,
                Step.INCUMBENT_CLEANUP,
                Step.REPLACEMENT_INIT);
    }

    @Test
    public void replacementStreamsBeforeIncumbentCleanup() {
        runScenario(
                Step.REPLACEMENT_RESERVED,
                Step.INCUMBENT_COMPLETES,
                Step.REPLACEMENT_INIT,
                Step.REPLACEMENT_STREAM,
                Step.INCUMBENT_CLEANUP);
    }

    @Test
    public void incumbentCleanupRunsAfterReplacementStream() {
        runScenario(
                Step.REPLACEMENT_RESERVED,
                Step.INCUMBENT_COMPLETES,
                Step.REPLACEMENT_INIT,
                Step.INCUMBENT_CLEANUP,
                Step.REPLACEMENT_STREAM);
    }

    @Test
    public void incumbentCompletesBeforeTheReservation() {
        runScenario(
                Step.INCUMBENT_COMPLETES,
                Step.REPLACEMENT_RESERVED,
                Step.REPLACEMENT_INIT,
                Step.INCUMBENT_CLEANUP);
    }

    /* ------------------------------------------------------------------ *
     * Scenario driver                                                     *
     * ------------------------------------------------------------------ */

    private void runScenario(Step... steps) {
        harness.initializeReady();
        long incumbentGeneration = EngineOwnership.currentGeneration();
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
                "v3-interleaving-incumbent", new Runnable() {
                    @Override
                    public void run() {
                        try {
                            harness.scheduler.runWorker();
                        } catch (Throwable failure) {
                            incumbentFailure.set(failure);
                        }
                    }
                });
        KokoroEngineTestSupport.await(streamEntered, "the incumbent native stream call");

        KokoroEngineTestSupport.ManualScheduler replacementScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener replacementListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine replacement = harness.newEngine(
                replacementScheduler, replacementListener);

        int reservationMark = -1;
        boolean reserved = false;
        boolean replacementCommitted = false;
        List<String> trace = new ArrayList<>();

        try {
            for (Step step : steps) {
                trace.add(step.name());
                switch (step) {
                    case REPLACEMENT_RESERVED:
                        replacement.initialize(replacementListener);
                        assertTrue("a replacement must reserve a newer generation",
                                EngineOwnership.reservedGeneration() > incumbentGeneration);
                        reserved = true;
                        reservationMark = harness.listener.states.size();
                        break;
                    case INCUMBENT_COMPLETES:
                        allowStreamResume.countDown();
                        KokoroEngineTestSupport.joinOrFail(incumbent);
                        harness.scheduler.runAllMain();
                        if (incumbentFailure.get() != null) {
                            throw new AssertionError(
                                    "incumbent worker failed in " + trace, incumbentFailure.get());
                        }
                        break;
                    case REPLACEMENT_INIT:
                        replacementScheduler.runAllWorker();
                        replacementScheduler.runAllMain();
                        replacementCommitted = replacementListener.states.contains(
                                LocalTtsEngine.State.READY);
                        break;
                    case INCUMBENT_CLEANUP:
                        harness.engine.shutdown();
                        harness.scheduler.runAllWorker();
                        harness.scheduler.runAllMain();
                        break;
                    case REPLACEMENT_STREAM:
                        harness.nativeApi.emitChunk(0.5f);
                        replacementListener.clear();
                        replacement.speak("hello", "en-GB", null);
                        replacementScheduler.runAllWorker();
                        replacementScheduler.runAllMain();
                        break;
                    default:
                        throw new AssertionError("unhandled step " + step);
                }
            }
        } finally {
            // Never leave the parked incumbent hanging on a failed assertion.
            allowStreamResume.countDown();
            if (incumbent.isAlive()) {
                KokoroEngineTestSupport.joinOrFail(incumbent);
            }
        }

        // -- Invariants ------------------------------------------------- //

        if (reserved) {
            List<LocalTtsEngine.State> afterReservation = new ArrayList<>(
                    harness.listener.states.subList(
                            reservationMark, harness.listener.states.size()));
            assertFalse("a superseded instance must not publish READY after the reservation "
                            + "(" + trace + "); observed " + afterReservation,
                    afterReservation.contains(LocalTtsEngine.State.READY));
            assertFalse("the incumbent must lose ownership on reservation (" + trace + ")",
                    EngineOwnership.owns(incumbentGeneration));
        }

        assertEquals("no release may target a non-live instance (" + trace + ")",
                0, harness.nativeApi.releaseWithoutInstance);

        List<Integer> released = harness.nativeApi.releasedSnapshot();
        assertEquals("no native instance may be released twice (" + trace + ")",
                new HashSet<>(released).size(), released.size());
        assertFalse("the incumbent's instance must never be released twice (" + trace + ")",
                countOf(released, incumbentInstance) > 1);

        assertTrue("a release must follow a successful init (" + trace + ")",
                harness.nativeApi.releaseCount <= harness.nativeApi.successfulInitCalls);

        if (replacementCommitted) {
            int replacementInstance = replacementInstanceOf();
            assertFalse("the incumbent's cleanup must not release the replacement's instance "
                            + "(" + trace + ")",
                    released.contains(replacementInstance));
            long replacementGeneration = EngineOwnership.currentGeneration();
            assertTrue("the replacement must own the newest generation (" + trace + ")",
                    EngineOwnership.owns(replacementGeneration));
            assertEquals("the replacement's instance must be the live one (" + trace + ")",
                    replacementInstance, harness.nativeApi.activeInstanceId());
        }

        for (KokoroEngineTestSupport.NativeCall call : harness.nativeApi.callsSnapshot()) {
            if ("release".equals(call.kind)) {
                assertTrue("a release must name the live instance (" + trace + "): " + call,
                        call.instanceId != 0);
            }
        }
    }

    private int replacementInstanceOf() {
        int instance = 0;
        for (KokoroEngineTestSupport.NativeCall call
                : harness.nativeApi.callsSnapshot()) {
            if ("init".equals(call.kind) && call.instanceId != 0) {
                instance = call.instanceId;
            }
        }
        if (instance == 0) {
            throw new AssertionError("the replacement did not create a native instance");
        }
        return instance;
    }

    private static int countOf(List<Integer> values, int value) {
        int count = 0;
        for (Integer candidate : values) {
            if (candidate != null && candidate == value) {
                count += 1;
            }
        }
        return count;
    }
}
