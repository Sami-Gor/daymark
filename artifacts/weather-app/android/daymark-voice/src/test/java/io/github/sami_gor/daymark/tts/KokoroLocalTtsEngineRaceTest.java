package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.concurrent.CountDownLatch;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * M3: lifecycle races around reload, shutdown and renderer recreation.
 *
 * <p>Every scenario runs against the real engine with a manual scheduler and an
 * instrumented native bridge, so ordering is exact and repeatable. The tests
 * pin the generation rules: stale callbacks never release or initialise a
 * newer generation, never publish READY for a stale voice and never clear a
 * newer operation's single-flight slot.
 */
public class KokoroLocalTtsEngineRaceTest {

    private static final String EN = NarrationVoicePolicy.ENGLISH_VOICE;
    private static final String FR = NarrationVoicePolicy.FRENCH_VOICE;
    private static final String ES = NarrationVoicePolicy.SPANISH_VOICE;

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
     * Shutdown races                                                      *
     * ------------------------------------------------------------------ */

    @Test
    public void shutdownDuringAQueuedReloadNeverPublishesReady() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.listener.clear();
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, capture);
        harness.engine.shutdown();
        harness.scheduler.runAllMain();

        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.UNINITIALIZED),
                harness.listener.states);

        harness.scheduler.runAllWorker();
        harness.scheduler.runAllMain();

        assertEquals("engine-shutdown", capture.lastError());
        assertFalse(capture.succeeded());
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.UNINITIALIZED),
                harness.listener.states);
        assertEquals(1, harness.nativeApi.releaseCount);
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertFalse(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    @Test
    public void shutdownDuringInFlightNativeInitRejectsTheCompletion() {
        harness.nativeApi.onInit = new Runnable() {
            @Override
            public void run() {
                harness.engine.shutdown();
            }
        };

        harness.engine.initialize(harness.listener);
        harness.scheduler.drain();

        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.UNINITIALIZED),
                harness.listener.states);
        assertTrue(harness.listener.errors.isEmpty());
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertEquals(1, harness.nativeApi.releaseCount);
        assertFalse(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    @Test
    public void shutdownDuringInFlightReloadReleasesBothGenerationsWithoutReady() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.listener.clear();
        harness.nativeApi.onInit = new Runnable() {
            @Override
            public void run() {
                harness.engine.shutdown();
            }
        };
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, capture);
        harness.scheduler.runAllWorker();
        harness.scheduler.runAllMain();

        assertEquals("engine-shutdown", capture.lastError());
        assertFalse(capture.succeeded());
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertEquals(LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());
        // The old generation is released before the replacement init; the new
        // engine created by the interrupted reload is released as well.
        assertEquals(2, harness.nativeApi.releaseCount);
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertFalse(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    @Test
    public void reloadRequestedAfterShutdownIsRejectedWithoutTouchingNative() {
        harness.initializeReady();
        harness.engine.shutdown();
        harness.scheduler.drain();
        harness.listener.clear();
        harness.assets.install(FR);
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, capture);
        harness.scheduler.drain();

        assertEquals("engine-shutdown", capture.lastError());
        assertTrue(harness.listener.states.isEmpty());
        assertEquals(Arrays.asList(EN), harness.nativeApi.initCalls);
        assertEquals(0, harness.scheduler.pendingWorker());
    }

    /* ------------------------------------------------------------------ *
     * Concurrent registrations and stale generations                      *
     * ------------------------------------------------------------------ */

    @Test
    public void concurrentRegistrationsAdmitExactlyOneOperation() throws Exception {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.assets.install(ES);
        harness.listener.clear();

        final int threads = 8;
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(threads);
        final List<KokoroEngineTestSupport.Capture> captures = new ArrayList<>();
        for (int i = 0; i < threads; i += 1) {
            final KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();
            captures.add(capture);
            final String voice = (i % 2 == 0) ? FR : ES;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        start.await();
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                    }
                    harness.engine.registerVoice(voice, capture);
                    done.countDown();
                }
            }).start();
        }
        start.countDown();
        done.await();

        int admitted = 0;
        int conflicts = 0;
        for (KokoroEngineTestSupport.Capture capture : captures) {
            if (capture.errors.isEmpty()) {
                admitted += 1;
            } else {
                assertEquals(Arrays.asList("operation-conflict"), capture.errors);
                conflicts += 1;
            }
        }
        assertEquals("only one registration may hold the single-flight slot", 1, admitted);
        assertEquals(threads - 1, conflicts);
        assertEquals(1, harness.scheduler.pendingWorker());

        harness.scheduler.drain();
        assertEquals(1, harness.nativeApi.initCalls.size() - 1);
    }

    @Test
    public void aStaleReloadCannotReleaseOrReadyANewerGeneration() throws Exception {
        harness.assets.install(FR);
        harness.initializeReady();
        harness.listener.clear();
        KokoroEngineTestSupport.Capture staleCapture = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, staleCapture);

        // Renderer recreation: a replacement engine commits a newer generation
        // before the old instance's queued reload runs.
        KokoroEngineTestSupport.ManualScheduler secondScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener secondListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine second = new KokoroLocalTtsEngine(
                secondScheduler,
                harness.assets,
                harness.audio,
                harness.nativeApi,
                harness.log,
                harness.clock);
        second.initialize(secondListener);
        secondScheduler.drain();
        assertEquals(LocalTtsEngine.State.READY, secondListener.lastState());
        long secondGeneration = EngineOwnership.currentGeneration();
        assertEquals(new HashSet<>(Arrays.asList(EN)), new HashSet<>(second.loadedVoices()));

        harness.scheduler.runAllWorker();
        harness.scheduler.runAllMain();

        // The stale completion touched neither the engine nor the state.
        assertEquals(0, harness.nativeApi.releaseCount);
        assertEquals("operation-conflict", staleCapture.lastError());
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertEquals(LocalTtsEngine.State.ERROR, harness.listener.lastState());
        assertTrue(EngineOwnership.owns(secondGeneration));
        assertEquals(new HashSet<>(Arrays.asList(EN)), new HashSet<>(second.loadedVoices()));

        // The stale slot was released but ownership keeps the old instance out.
        KokoroEngineTestSupport.Capture retry = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, retry);
        assertEquals("engine-superseded", retry.lastError());

        harness.listener.clear();
        harness.engine.initialize(harness.listener);
        harness.scheduler.runAllMain();
        assertEquals(Arrays.asList("engine-superseded"), harness.listener.errors);
        assertEquals(secondGeneration, EngineOwnership.currentGeneration());

        // The replacement generation still speaks.
        harness.nativeApi.emitChunk(0.5f, 0.5f);
        secondListener.clear();
        second.speak("hello", "en-GB", null);
        secondScheduler.drain();
        assertTrue(secondListener.errors.isEmpty());
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.SPEAKING, LocalTtsEngine.State.READY),
                secondListener.states);

        harness.engine.shutdown();
        harness.scheduler.drain();
        assertEquals("the stale instance must not release the replacement engine",
                0, harness.nativeApi.releaseCount);
        second.shutdown();
        secondScheduler.drain();
        assertEquals(1, harness.nativeApi.releaseCount);
    }

    @Test
    public void rendererRecreationReleasesOnlyTheNewestGeneration() {
        harness.initializeReady();

        KokoroEngineTestSupport.ManualScheduler secondScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener secondListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine second = new KokoroLocalTtsEngine(
                secondScheduler,
                harness.assets,
                harness.audio,
                harness.nativeApi,
                harness.log,
                harness.clock);
        second.initialize(secondListener);
        secondScheduler.drain();
        assertEquals(LocalTtsEngine.State.READY, secondListener.lastState());

        harness.engine.shutdown();
        harness.scheduler.drain();

        assertEquals(0, harness.nativeApi.releaseCount);
        assertTrue(EngineOwnership.owns(EngineOwnership.currentGeneration()));
        assertEquals(new HashSet<>(Arrays.asList(EN)), new HashSet<>(second.loadedVoices()));

        second.shutdown();
        secondScheduler.drain();
        assertEquals(1, harness.nativeApi.releaseCount);
        assertFalse(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    @Test
    public void aLosingConcurrentInitializationEndsInErrorInsteadOfLoadingForever() {
        KokoroEngineTestSupport.ManualScheduler secondScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener secondListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine second = new KokoroLocalTtsEngine(
                secondScheduler, harness.assets, harness.audio,
                harness.nativeApi, harness.log, harness.clock);

        // Both instances reserve; only the newest reservation may initialise.
        harness.engine.initialize(harness.listener);
        second.initialize(secondListener);
        secondScheduler.drain();
        assertEquals(LocalTtsEngine.State.READY, secondListener.lastState());

        harness.scheduler.runAllWorker();
        harness.scheduler.runAllMain();

        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.ERROR),
                harness.listener.states);
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertEquals(1, harness.nativeApi.initCalls.size());
        second.shutdown();
        secondScheduler.drain();
    }

    @Test
    public void aSupersededInstanceRefusesToSpeak() {
        harness.initializeReady();
        KokoroEngineTestSupport.ManualScheduler secondScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener secondListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine second = new KokoroLocalTtsEngine(
                secondScheduler, harness.assets, harness.audio,
                harness.nativeApi, harness.log, harness.clock);
        second.initialize(secondListener);
        secondScheduler.drain();
        harness.listener.clear();

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.drain();

        assertEquals(Arrays.asList("engine-superseded"), harness.listener.errors);
        assertEquals(0, harness.nativeApi.streamStartCalls);
        second.shutdown();
    }

    /* ------------------------------------------------------------------ *
     * Cancellation, removal and retry                                     *
     * ------------------------------------------------------------------ */

    @Test
    public void cancellationDuringSynthesisStopsWithoutPublishingReady() {
        harness.initializeReady();
        harness.nativeApi.emitChunk(0.5f, 0.5f);
        harness.listener.clear();
        harness.audio.onWrite = new Runnable() {
            @Override
            public void run() {
                harness.engine.stop();
            }
        };

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllWorker();
        harness.scheduler.runAllMain();

        assertEquals(Arrays.asList(
                LocalTtsEngine.State.SPEAKING, LocalTtsEngine.State.STOPPED),
                harness.listener.states);
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertTrue(harness.listener.errors.isEmpty());
        assertEquals(1, harness.nativeApi.streamClearCount);
        assertTrue(harness.audio.lastHandle().released);
    }

    @Test
    public void stoppingDuringAReloadDoesNotCancelOrCorruptIt() {
        harness.initializeReady();
        harness.assets.install(FR);
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, capture);
        harness.listener.clear();

        harness.engine.stop();
        harness.scheduler.drain();

        assertTrue(capture.succeeded());
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.READY),
                harness.listener.states);
        assertEquals(new HashSet<>(Arrays.asList(FR)), harness.loaded());
        assertTrue(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    @Test
    public void removalDuringSynthesisDoesNotCorruptTheLoadedGeneration() {
        harness.initializeReady();
        harness.nativeApi.emitChunk(0.5f, 0.5f);
        harness.listener.clear();
        harness.audio.onWrite = new Runnable() {
            @Override
            public void run() {
                harness.assets.remove(EN);
            }
        };

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.drain();

        assertTrue(harness.listener.errors.isEmpty());
        assertEquals(LocalTtsEngine.State.READY, harness.listener.lastState());
        assertFalse(harness.engine.isVoiceInstalled(EN));
        assertEquals("loaded reflects the native generation, not the directory",
                new HashSet<>(Arrays.asList(EN)), harness.loaded());

        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(EN, capture);
        assertEquals("voice-not-installed", capture.lastError());
        assertEquals(Arrays.asList(EN), harness.nativeApi.initCalls);
    }

    @Test
    public void retryAfterAnUnrecoveredReloadReachesReady() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.nativeApi.failAll = true;
        KokoroEngineTestSupport.Capture failed = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, failed);
        harness.scheduler.drain();
        assertEquals("reload-failed-unrecovered", failed.lastError());
        assertEquals(LocalTtsEngine.State.ERROR, harness.listener.lastState());

        harness.nativeApi.failAll = false;
        harness.listener.clear();
        KokoroEngineTestSupport.Capture retry = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, retry);
        harness.scheduler.drain();

        assertTrue(retry.succeeded());
        assertEquals(new HashSet<>(Arrays.asList(FR)), retry.successes.get(0));
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.READY),
                harness.listener.states);
        assertEquals(new HashSet<>(Arrays.asList(FR)), harness.loaded());
        assertTrue(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    @Test
    public void initializeRetryAfterFailureReachesReady() {
        harness.nativeApi.failAll = true;
        harness.engine.initialize(harness.listener);
        harness.scheduler.drain();
        assertEquals(LocalTtsEngine.State.ERROR, harness.listener.lastState());
        assertTrue(harness.engine.loadedVoices().isEmpty());

        harness.nativeApi.failAll = false;
        harness.listener.clear();

        harness.engine.initialize(harness.listener);
        harness.scheduler.drain();

        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.READY),
                harness.listener.states);
        assertEquals(Arrays.asList(EN, EN), harness.nativeApi.initCalls);
        assertEquals(new HashSet<>(Arrays.asList(EN)), harness.loaded());
        assertTrue(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    @Test
    public void repeatedShutdownReleasesTheNativeEngineExactlyOnce() {
        harness.initializeReady();
        harness.listener.clear();

        harness.engine.shutdown();
        harness.engine.shutdown();
        harness.scheduler.drain();

        assertEquals(1, harness.nativeApi.releaseCount);
        assertEquals(Arrays.asList(LocalTtsEngine.State.UNINITIALIZED), harness.listener.states);
    }

    @Test
    public void initializeAfterShutdownFailsClosed() {
        harness.initializeReady();
        harness.engine.shutdown();
        harness.scheduler.drain();
        harness.listener.clear();

        harness.engine.initialize(harness.listener);
        harness.scheduler.drain();

        assertEquals(Arrays.asList("engine-shutdown"), harness.listener.errors);
        assertTrue(harness.listener.states.isEmpty());
        assertEquals(1, harness.nativeApi.releaseCount);
    }

    @Test
    public void aNewEngineAfterShutdownInitializesAndSpeaks() {
        harness.initializeReady();
        harness.engine.shutdown();
        harness.scheduler.drain();
        assertEquals(1, harness.nativeApi.releaseCount);

        KokoroEngineTestSupport.ManualScheduler freshScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener freshListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine fresh = new KokoroLocalTtsEngine(
                freshScheduler, harness.assets, harness.audio,
                harness.nativeApi, harness.log, harness.clock);
        fresh.initialize(freshListener);
        freshScheduler.drain();
        assertEquals(LocalTtsEngine.State.READY, freshListener.lastState());
        assertEquals(new HashSet<>(Arrays.asList(EN)), new HashSet<>(fresh.loadedVoices()));
        assertTrue(EngineOwnership.owns(EngineOwnership.currentGeneration()));

        harness.nativeApi.emitChunk(0.5f, 0.5f);
        freshListener.clear();
        fresh.speak("hello", "en-GB", null);
        freshScheduler.drain();
        assertTrue(freshListener.errors.isEmpty());
        assertEquals(LocalTtsEngine.State.READY, freshListener.lastState());
        fresh.shutdown();
        freshScheduler.drain();
    }

    @Test
    public void aStaleReloadCompletionFreesItsSlotWithoutBlockingANewerInstance() {
        harness.initializeReady();
        harness.assets.install(FR);
        KokoroEngineTestSupport.Capture staleCapture = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, staleCapture);

        // Invalidate the in-flight reload the way shutdown does, then abort it.
        harness.engine.shutdown();
        harness.scheduler.drain();

        assertEquals("engine-shutdown", staleCapture.lastError());
        assertEquals(0, harness.scheduler.pendingWorker());

        // A replacement instance can take the next generation immediately.
        KokoroEngineTestSupport.ManualScheduler freshScheduler =
                new KokoroEngineTestSupport.ManualScheduler();
        KokoroEngineTestSupport.RecordingListener freshListener =
                new KokoroEngineTestSupport.RecordingListener();
        KokoroLocalTtsEngine fresh = new KokoroLocalTtsEngine(
                freshScheduler, harness.assets, harness.audio,
                harness.nativeApi, harness.log, harness.clock);
        fresh.initialize(freshListener);
        freshScheduler.drain();
        assertEquals(LocalTtsEngine.State.READY, freshListener.lastState());
        assertNotEquals(0L, EngineOwnership.currentGeneration());
        fresh.shutdown();
        freshScheduler.drain();
    }
}
