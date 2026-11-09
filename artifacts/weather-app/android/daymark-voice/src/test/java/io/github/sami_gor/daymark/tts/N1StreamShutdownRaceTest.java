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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * N-1 regression: exactly-once native ownership vs. a concurrent stream
 * shutdown.
 *
 * <p>{@code KokoroLocalTtsEngine.startWholeStream()} marks the instance live
 * after a successful {@code nativeApi.streamStart()}, but does so outside
 * {@link EngineOwnership#NATIVE_LOCK}. If a release path (shutdown, or a
 * reload cleaning up a failed generation) runs between the native stream start
 * and that assignment, the stale stream completion sets
 * {@code nativeInstanceLive} back to {@code true} after the instance was
 * already released. A later cleanup path then calls
 * {@code nativeApi.release()} a second time for a single native instance.
 *
 * <p>Every scenario here is deterministic: the fake native bridge holds
 * {@code streamStart} (or a reload init) on a latch, a second thread drives
 * shutdown/cleanup, and the test releases the latch only after the ordering it
 * wants to prove has happened. No {@code Thread.sleep} is used. The
 * exactly-once invariant is checked as
 * {@code releaseCount == successfulInitCalls}: each successful init creates one
 * native instance, and each instance may be released at most once.
 */
public class N1StreamShutdownRaceTest {

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
     * 1. Whole-stream / shutdown race                                     *
     * ------------------------------------------------------------------ */

    @Test
    public void wholeStreamEnteredThenShutdownReleasesOnceAndDoesNotResurrectOwnership()
            throws Exception {
        harness.initializeReady();
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
        assertEquals(Arrays.asList(LocalTtsEngine.State.SPEAKING), harness.listener.states);

        AtomicReference<Throwable> streamFailure = new AtomicReference<>();
        Thread stream = startWorker("n1-whole-stream", streamFailure);
        await(streamEntered);
        assertEquals("the stream handshake must be in flight",
                1, harness.nativeApi.streamStartCalls);

        // Another thread tears the engine down while streamStart is on the stack.
        harness.engine.shutdown();
        // Run shutdown's queued release task: the single live instance is freed.
        harness.scheduler.runWorker();
        assertEquals("shutdown releases the one live instance", 1,
                harness.nativeApi.releaseCount);

        // The native stream start now returns successfully. The stale
        // completion must not recreate release eligibility.
        allowStreamResume.countDown();
        joinWorker(stream, streamFailure);
        harness.scheduler.runAllMain();

        assertEquals(1, harness.nativeApi.successfulInitCalls);
        assertEquals("exactly one actual release for the one instance",
                1, harness.nativeApi.releaseCount);
        assertFalse("stale stream completion resurrected ownership",
                KokoroEngineTestSupport.nativeInstanceLive(harness.engine));
        assertEquals(LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertFalse(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    /* ------------------------------------------------------------------ *
     * 2. Segmented-stream equivalent                                      *
     * ------------------------------------------------------------------ */

    @Test
    public void segmentedStreamEnteredThenShutdownReleasesOnceAndDoesNotResurrectOwnership()
            throws Exception {
        harness.initializeReady();
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

        harness.engine.speak("hello world", "en-GB", Arrays.asList("hello ", "world"));
        harness.scheduler.runAllMain();

        AtomicReference<Throwable> streamFailure = new AtomicReference<>();
        Thread stream = startWorker("n1-segmented-stream", streamFailure);
        await(streamEntered);
        assertEquals(1, harness.nativeApi.streamStartCalls);

        harness.engine.shutdown();
        harness.scheduler.runWorker();
        assertEquals(1, harness.nativeApi.releaseCount);

        allowStreamResume.countDown();
        joinWorker(stream, streamFailure);
        harness.scheduler.runAllMain();

        assertEquals(1, harness.nativeApi.successfulInitCalls);
        assertEquals("exactly one actual release for the one instance",
                1, harness.nativeApi.releaseCount);
        // On de7c9b5 the segmented path never writes nativeInstanceLive, so
        // this assertion pins the asymmetry with startWholeStream: a future
        // fix must not "restore symmetry" by adding the same late write here.
        assertFalse("segmented completion must not resurrect ownership",
                KokoroEngineTestSupport.nativeInstanceLive(harness.engine));
        assertEquals(LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));
    }

    /* ------------------------------------------------------------------ *
     * 3. Two competing cleanup paths on the same instance                 *
     * ------------------------------------------------------------------ */

    @Test
    public void twoCompetingCleanupPathsOnTheSameInstanceReleaseExactlyOnce() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.listener.clear();

        // Shutdown starts inside the replacement init: the in-flight reload's
        // stale cleanup and shutdown's queued release both target the instance
        // the reload just created.
        harness.nativeApi.onInit = new Runnable() {
            @Override
            public void run() {
                harness.engine.shutdown();
            }
        };
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, capture);
        harness.scheduler.drain();

        assertEquals("one release per successful native init",
                harness.nativeApi.successfulInitCalls, harness.nativeApi.releaseCount);
        assertEquals(2, harness.nativeApi.successfulInitCalls);
        assertEquals("engine-shutdown", capture.lastError());
        assertFalse(capture.succeeded());
        assertEquals(LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertFalse(KokoroEngineTestSupport.nativeInstanceLive(harness.engine));
        assertFalse(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    /* ------------------------------------------------------------------ *
     * 4. Stale stream completion after shutdown                           *
     * ------------------------------------------------------------------ */

    @Test
    public void staleWholeStreamCompletionAfterShutdownCannotTriggerASecondRelease()
            throws Exception {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.listener.clear();

        final CountDownLatch streamEntered = new CountDownLatch(1);
        final CountDownLatch allowStreamResume = new CountDownLatch(1);
        final CountDownLatch restoreInitEntered = new CountDownLatch(1);
        final CountDownLatch allowRestoreInit = new CountDownLatch(1);
        final AtomicInteger reloadInitCalls = new AtomicInteger();

        harness.nativeApi.onStreamStart = new Runnable() {
            @Override
            public void run() {
                streamEntered.countDown();
                awaitUnchecked(allowStreamResume);
            }
        };
        // Both replacement inits fail. The first (French) fails immediately so
        // the engine attempts the recovery init; the recovery init (English)
        // is held so shutdown can land while the reload owns NATIVE_LOCK.
        harness.nativeApi.failAll = true;
        harness.nativeApi.onInit = new Runnable() {
            @Override
            public void run() {
                if (reloadInitCalls.incrementAndGet() == 2) {
                    restoreInitEntered.countDown();
                    awaitUnchecked(allowRestoreInit);
                }
            }
        };

        harness.engine.speak("hello world", "en-GB", null);
        harness.scheduler.runAllMain();
        AtomicReference<Throwable> streamFailure = new AtomicReference<>();
        Thread stream = startWorker("n1-stale-stream", streamFailure);
        await(streamEntered);

        // Cancellation makes the engine admissible for a replacement voice
        // while the old stream is still inside nativeApi.streamStart().
        harness.engine.stop();
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, capture);
        AtomicReference<Throwable> reloadFailure = new AtomicReference<>();
        Thread reload = startWorker("n1-reload", reloadFailure);
        await(restoreInitEntered);
        assertEquals("the reload released the original instance before init",
                1, harness.nativeApi.releaseCount);

        // Shutdown while both the stream and the reload are suspended.
        harness.engine.shutdown();

        // The stale whole-stream completion resurrects ownership after the
        // instance was released.
        allowStreamResume.countDown();
        joinWorker(stream, streamFailure);

        // The reload's failed-recovery cleanup now observes the resurrected
        // flag and would issue a second native release for the same instance.
        allowRestoreInit.countDown();
        joinWorker(reload, reloadFailure);
        harness.scheduler.drain();

        assertFalse(capture.succeeded());
        assertEquals("engine-shutdown", capture.lastError());
        assertEquals(1, harness.nativeApi.successfulInitCalls);
        assertEquals("one release per successful native init; the stale stream must not add one",
                harness.nativeApi.successfulInitCalls, harness.nativeApi.releaseCount);
        assertFalse("no ownership resurrection survives the cleanup",
                KokoroEngineTestSupport.nativeInstanceLive(harness.engine));
        assertEquals(LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertFalse(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    /* ------------------------------------------------------------------ *
     * 5. Old stream completes after a newer valid generation exists       *
     * ------------------------------------------------------------------ */

    @Test
    public void oldStreamCompletionAfterANewerGenerationCannotReleaseTheNewerInstance()
            throws Exception {
        harness.initializeReady();
        final CountDownLatch streamEntered = new CountDownLatch(1);
        final CountDownLatch allowStreamResume = new CountDownLatch(1);
        harness.nativeApi.onStreamStart = new Runnable() {
            @Override
            public void run() {
                streamEntered.countDown();
                awaitUnchecked(allowStreamResume);
            }
        };

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllMain();
        AtomicReference<Throwable> streamFailure = new AtomicReference<>();
        Thread stream = startWorker("n1-old-stream", streamFailure);
        await(streamEntered);
        harness.listener.clear();

        // The old instance shuts down but its release task stays queued.
        harness.engine.shutdown();

        // Renderer recreation: a replacement engine commits a newer generation
        // before the old release task runs.
        KokoroEngineTestSupport.ManualScheduler secondScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener secondListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine second = new KokoroLocalTtsEngine(
                secondScheduler, harness.assets, harness.audio,
                harness.nativeApi, harness.log, harness.clock);
        second.initialize(secondListener);
        secondScheduler.drain();
        assertEquals(LocalTtsEngine.State.READY, secondListener.lastState());
        long secondGeneration = EngineOwnership.currentGeneration();

        // The old stream completes only after the newer generation exists.
        allowStreamResume.countDown();
        joinWorker(stream, streamFailure);
        // Now drain the old instance's queued shutdown release.
        harness.scheduler.drain();

        assertEquals("a superseded instance must not release the newer engine",
                0, harness.nativeApi.releaseCount);
        assertTrue(EngineOwnership.owns(secondGeneration));
        assertEquals(new HashSet<>(Arrays.asList(EN)), new HashSet<>(second.loadedVoices()));
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));

        // The newer instance is intact: it speaks, then releases exactly once.
        harness.nativeApi.emitChunk(0.5f, 0.5f);
        secondListener.clear();
        second.speak("hello", "en-GB", null);
        secondScheduler.drain();
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.SPEAKING, LocalTtsEngine.State.READY),
                secondListener.states);

        second.shutdown();
        secondScheduler.drain();
        assertEquals("only the newer instance's release reaches the bridge",
                1, harness.nativeApi.releaseCount);
        assertFalse(EngineOwnership.owns(secondGeneration));
    }

    /* ------------------------------------------------------------------ *
     * 6. release() throwing                                               *
     * ------------------------------------------------------------------ */

    @Test
    public void throwingReleaseIsObservableAndIsNotRetriedAutomatically() {
        harness.initializeReady();
        harness.listener.clear();
        harness.nativeApi.releaseThrows = true;

        harness.engine.shutdown();
        harness.scheduler.drain();

        assertEquals("exactly one release attempt", 1, harness.nativeApi.releaseCount);
        assertEquals(1, harness.nativeApi.successfulInitCalls);
        assertTrue("a failed release must be reported, not swallowed silently",
                hasWarning("shutdown: release failed"));
        assertEquals(LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));
        // The helper clears the flag before entering the bridge, so a throwing
        // release cannot stay eligible for a second attempt.
        assertFalse(KokoroEngineTestSupport.nativeInstanceLive(harness.engine));

        harness.engine.shutdown();
        harness.scheduler.drain();
        assertEquals("no automatic second release after a failure",
                1, harness.nativeApi.releaseCount);
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
            assertTrue("timed out waiting for worker ordering", latch.await(5, TimeUnit.SECONDS));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            fail("interrupted while waiting for worker ordering");
        }
    }

    /** Used from inside a fake-native hook running on a worker thread. */
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

    private boolean hasWarning(String fragment) {
        for (String warning : harness.log.warnings) {
            if (warning != null && warning.contains(fragment)) {
                return true;
            }
        }
        return false;
    }
}
