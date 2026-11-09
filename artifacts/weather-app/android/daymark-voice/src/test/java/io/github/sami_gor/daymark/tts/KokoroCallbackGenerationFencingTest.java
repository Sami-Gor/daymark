package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.Arrays;
import java.util.Collections;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * H3: listener callbacks were posted to the main thread without any
 * generation/epoch identity, so a callback produced by a superseded or
 * shut-down native generation could be delivered after the process-global
 * engine had been replaced or torn down.
 *
 * <p>Every scenario queues a completion callback, changes ownership or shuts
 * the engine down before the main queue drains, and then asserts the stale
 * callback is dropped. No test depends on thread scheduling: the manual
 * scheduler separates the worker and main queues deterministically.
 */
public class KokoroCallbackGenerationFencingTest {

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
     * notifyError                                                         *
     * ------------------------------------------------------------------ */

    @Test
    public void notifyErrorQueuedBeforeShutdownIsNotDeliveredAfterShutdown() {
        harness.initializeReady();
        // Force the monolithic synth path, which reports "no audio" through
        // notifyError.
        harness.nativeApi.streamStartError = "stream disabled";
        harness.listener.clear();

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllWorker();
        // The worker posted onError and onStateChanged(READY); neither is
        // delivered until the main queue drains.
        assertEquals(0, harness.listener.errors.size());
        assertEquals(0, harness.listener.states.size());

        harness.engine.shutdown();
        harness.scheduler.runAllMain();

        assertTrue("H3: a shut-down generation must not report a stale error",
                harness.listener.errors.isEmpty());
        assertEquals(Collections.singletonList(LocalTtsEngine.State.UNINITIALIZED),
                harness.listener.states);
    }

    @Test
    public void notifyErrorQueuedBeforeANewerGenerationOwnsIsNotDelivered() {
        harness.initializeReady();
        harness.nativeApi.streamStartError = "stream disabled";
        harness.listener.clear();

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllWorker();
        assertEquals(0, harness.listener.errors.size());

        // Same Java instance, newer native generation: a voice reload reserves
        // and commits G2 while G1's error is still queued for the main thread.
        harness.assets.install(FR);
        harness.engine.registerVoice(FR, new KokoroEngineTestSupport.Capture());
        harness.scheduler.runAllWorker();
        long current = EngineOwnership.currentGeneration();
        assertTrue("the reload committed a newer owner", EngineOwnership.owns(current));

        harness.scheduler.runAllMain();

        assertTrue("H3: a superseded generation must not report a stale error",
                harness.listener.errors.isEmpty());
        assertEquals(LocalTtsEngine.State.READY, harness.listener.lastState());
    }

    @Test
    public void notifyErrorQueuedBeforeAnotherInstanceOwnsIsNotDelivered() {
        harness.initializeReady();
        harness.nativeApi.streamStartError = "stream disabled";
        harness.listener.clear();

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllWorker();
        assertEquals(0, harness.listener.errors.size());

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

        harness.scheduler.runAllMain();

        assertTrue("H3: a superseded instance must not report a stale error",
                harness.listener.errors.isEmpty());
        assertTrue(secondListener.errors.isEmpty());

        second.shutdown();
        secondScheduler.drain();
    }

    @Test
    public void initializationErrorQueuedBeforeAnotherInstanceOwnsIsNotDelivered() {
        harness.nativeApi.failAll = true;
        harness.engine.initialize(harness.listener);
        harness.scheduler.runAllWorker();
        // The failed generation's error and ERROR transition are queued.
        assertEquals(0, harness.listener.errors.size());

        harness.nativeApi.failAll = false;
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

        harness.scheduler.runAllMain();

        assertTrue("H3: a superseded initialisation must not report a stale error",
                harness.listener.errors.isEmpty());
        // The superseded instance still terminates its own state machine.
        assertEquals(LocalTtsEngine.State.ERROR, harness.listener.lastState());

        second.shutdown();
        secondScheduler.drain();
    }

    /* ------------------------------------------------------------------ *
     * onAudioMeasured                                                     *
     * ------------------------------------------------------------------ */

    @Test
    public void audioMeasurementQueuedBeforeShutdownIsNotDeliveredAfterShutdown() {
        harness.initializeReady();
        harness.nativeApi.emitChunk(0.5f, 0.5f);
        harness.listener.clear();

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllWorker();
        assertEquals(0, harness.listener.audioDurations.size());

        harness.engine.shutdown();
        harness.scheduler.runAllMain();

        assertTrue("H3: a shut-down generation must not inject an audio measurement",
                harness.listener.audioDurations.isEmpty());
    }

    @Test
    public void audioMeasurementQueuedBeforeANewerGenerationOwnsIsNotDelivered() {
        harness.initializeReady();
        harness.nativeApi.emitChunk(0.5f, 0.5f);
        harness.listener.clear();

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllWorker();
        assertEquals(0, harness.listener.audioDurations.size());

        harness.assets.install(FR);
        harness.engine.registerVoice(FR, new KokoroEngineTestSupport.Capture());
        harness.scheduler.runAllWorker();
        long current = EngineOwnership.currentGeneration();
        assertTrue("the reload committed a newer owner", EngineOwnership.owns(current));

        harness.scheduler.runAllMain();

        assertTrue("H3: a superseded generation must not inject an audio measurement",
                harness.listener.audioDurations.isEmpty());
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.READY),
                harness.listener.states);
    }

    @Test
    public void audioMeasurementQueuedBeforeAnotherInstanceOwnsIsNotDelivered() {
        harness.initializeReady();
        harness.nativeApi.emitChunk(0.5f, 0.5f);
        harness.listener.clear();

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllWorker();
        assertEquals(0, harness.listener.audioDurations.size());

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

        harness.scheduler.runAllMain();

        assertTrue("H3: a superseded instance must not inject an audio measurement",
                harness.listener.audioDurations.isEmpty());
        assertTrue(secondListener.audioDurations.isEmpty());

        second.shutdown();
        secondScheduler.drain();
    }

    @Test
    public void audioMeasurementForTheCurrentGenerationIsStillDelivered() {
        harness.initializeReady();
        float[] chunk = new float[2400];
        java.util.Arrays.fill(chunk, 0.5f);
        harness.nativeApi.emitChunk(chunk);

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.drain();

        assertEquals("fencing must not suppress a current measurement",
                1, harness.listener.audioDurations.size());
        assertEquals(Long.valueOf(100L), harness.listener.audioDurations.get(0));
    }

    /* ------------------------------------------------------------------ *
     * listener state delivery                                             *
     * ------------------------------------------------------------------ */

    @Test
    public void readyStateQueuedBeforeShutdownIsNotDeliveredAfterShutdown() {
        harness.initializeReady();
        harness.listener.clear();

        harness.engine.speak("hello", "en-GB", null);
        // SPEAKING is published at admission; the worker publishes READY into
        // the main queue, and shutdown wins before it is delivered.
        harness.scheduler.runAllWorker();
        harness.engine.shutdown();
        harness.scheduler.runAllMain();

        assertTrue("H3: a shut-down engine must not publish READY",
                !harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertEquals(LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());
    }

    @Test
    public void readyStateQueuedBeforeANewerGenerationOwnsIsNotDelivered() {
        harness.initializeReady();
        harness.listener.clear();

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.runAllWorker();
        // READY from generation G1 is queued but not delivered.
        assertEquals(0, harness.listener.states.size());

        harness.assets.install(FR);
        harness.engine.registerVoice(FR, new KokoroEngineTestSupport.Capture());
        harness.scheduler.runAllWorker();

        harness.scheduler.runAllMain();

        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.READY),
                harness.listener.states);
        assertEquals(LocalTtsEngine.State.READY, harness.listener.lastState());
    }
}
