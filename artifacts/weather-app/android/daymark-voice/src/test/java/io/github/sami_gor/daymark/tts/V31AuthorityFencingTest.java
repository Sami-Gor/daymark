package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import io.github.sami_gor.daymark.tts.KokoroEngineTestSupport.Capture;
import io.github.sami_gor.daymark.tts.KokoroEngineTestSupport.Harness;
import io.github.sami_gor.daymark.tts.KokoroEngineTestSupport.ManualScheduler;
import io.github.sami_gor.daymark.tts.KokoroEngineTestSupport.RecordingListener;

import java.io.File;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/** V3.1 C1/C2 regression tests. */
public class V31AuthorityFencingTest {

    private static final String EN = NarrationVoicePolicy.ENGLISH_VOICE;
    private static final String FR = NarrationVoicePolicy.FRENCH_VOICE;

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private Harness harness;

    @Before
    public void setUp() throws Exception {
        EngineOwnership.resetForTest();
        harness = new Harness(temporaryFolder.newFolder("files"));
    }

    private KokoroLocalTtsEngine replacement(ManualScheduler scheduler, RecordingListener listener) {
        return new KokoroLocalTtsEngine(scheduler, harness.assets, harness.audio,
                harness.nativeApi, harness.log, harness.clock);
    }

    /** A reaches ERROR via an unrecovered reload (its own reservation pending). */
    private void driveIntoUnrecoveredError() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.nativeApi.failVoice(FR);
        harness.nativeApi.failVoice(EN); // no restore either => unrecovered
        Capture reload = new Capture();
        harness.engine.registerVoice(FR, reload);
        harness.scheduler.drain();
        assertEquals("reload-failed-unrecovered", reload.lastError());
        assertEquals(LocalTtsEngine.State.ERROR, harness.listener.lastState());
    }

    // A: revoked ERROR instance must not steal a replacement's reservation.
    @Test
    public void revokedErrorInstanceCannotRetryAfterAReplacementReserves() {
        driveIntoUnrecoveredError();
        long staleGeneration = EngineOwnership.currentGeneration();
        assertTrue("sanity: generation exists", staleGeneration > 0);

        ManualScheduler replacementScheduler = new ManualScheduler();
        RecordingListener replacementListener = new RecordingListener();
        KokoroLocalTtsEngine replacement = replacement(replacementScheduler, replacementListener);
        replacement.initialize(replacementListener);
        long replacementGeneration = EngineOwnership.reservedGeneration();
        assertTrue(EngineOwnership.isLatestReservation(replacementGeneration));

        RecordingListener retryListener = new RecordingListener();
        harness.engine.initialize(retryListener);
        harness.scheduler.drain();

        assertFalse("rejected retry must report an error", retryListener.errors.isEmpty());
        assertEquals("engine-superseded", retryListener.errors.get(0));
        assertEquals("replacement reservation must survive the old retry",
                replacementGeneration, EngineOwnership.reservedGeneration());
        assertTrue(EngineOwnership.isLatestReservation(replacementGeneration));
    }

    // B: newest authoritative replacement failed its init and may retry.
    @Test
    public void newestAuthoritativeReplacementCanRetryItsFailedInit() {
        harness.initializeReady();
        long firstGeneration = EngineOwnership.currentGeneration();

        harness.nativeApi.failAll = true;
        ManualScheduler replacementScheduler = new ManualScheduler();
        RecordingListener replacementListener = new RecordingListener();
        KokoroLocalTtsEngine replacement = replacement(replacementScheduler, replacementListener);
        replacement.initialize(replacementListener);
        replacementScheduler.drain();
        assertEquals(LocalTtsEngine.State.ERROR, replacementListener.lastState());
        long reserved = EngineOwnership.reservedGeneration();
        assertTrue("failed replacement still owns the newest reservation",
                EngineOwnership.isLatestReservation(reserved));

        // Retry while its own reservation remains newest.
        harness.nativeApi.failAll = false;
        replacement.initialize(replacementListener);
        replacementScheduler.drain();

        assertEquals("replacement retry must reach READY",
                LocalTtsEngine.State.READY, replacementListener.lastState());
        assertTrue("replacement retry must own the engine",
                EngineOwnership.owns(EngineOwnership.currentGeneration()));
        assertFalse("original generation must stay revoked",
                EngineOwnership.owns(firstGeneration));
    }

    // C: a READY produced by A must be dropped once B reserves.
    @Test
    public void supersededReadyDeliveryIsRejected() {
        harness.initializeReady();
        harness.listener.clear();
        harness.assets.install(FR);

        ManualScheduler replacementScheduler = new ManualScheduler();
        RecordingListener replacementListener = new RecordingListener();
        KokoroLocalTtsEngine replacement = replacement(replacementScheduler, replacementListener);

        // A speaks: SPEAKING is posted but not delivered yet.
        harness.engine.speak("Bonjour", "en-GB", null);
        assertTrue(harness.scheduler.pendingMain() > 0);

        // B reserves before A's queued delivery runs.
        replacement.initialize(replacementListener);
        long reservation = EngineOwnership.reservedGeneration();
        assertTrue(EngineOwnership.isLatestReservation(reservation));

        // Deliver A's queued callback(s): READY must be rejected.
        harness.scheduler.runAllMain();
        harness.scheduler.runAllWorker();
        harness.scheduler.runAllMain();

        for (LocalTtsEngine.State state : harness.listener.states) {
            assertFalse("superseded A must not deliver READY",
                    state == LocalTtsEngine.State.READY);
            assertFalse("superseded A must not deliver SPEAKING",
                    state == LocalTtsEngine.State.SPEAKING);
        }
        assertTrue("B keeps the newest reservation",
                EngineOwnership.isLatestReservation(reservation));
    }

    // C (explicit READY race): A's READY is posted and held; B reserves; the
    // held READY must never reach A's listener once B is authoritative.
    @Test
    public void readyPostedBeforeAReplacementReservationIsNotDelivered() {
        ManualScheduler aScheduler = new ManualScheduler();
        RecordingListener aListener = new RecordingListener();
        KokoroLocalTtsEngine a = replacement(aScheduler, aListener);
        a.initialize(aListener);
        aScheduler.runAllWorker();
        assertTrue("A must have posted its READY callback", aScheduler.pendingMain() > 0);
        assertFalse("READY is held, not yet delivered",
                aListener.states.contains(LocalTtsEngine.State.READY));

        ManualScheduler bScheduler = new ManualScheduler();
        RecordingListener bListener = new RecordingListener();
        KokoroLocalTtsEngine b = replacement(bScheduler, bListener);
        b.initialize(bListener);
        long reservation = EngineOwnership.reservedGeneration();
        assertTrue(EngineOwnership.isLatestReservation(reservation));

        // Execute A's previously queued delivery while B is authoritative.
        aScheduler.runAllMain();

        assertFalse("stale READY must be dropped after the reservation",
                aListener.states.contains(LocalTtsEngine.State.READY));
        assertTrue("B must retain the newest reservation",
                EngineOwnership.isLatestReservation(reservation));
        assertFalse("the pre-reservation owner is revoked",
                EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }
}