package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Unit tests for the utterance endpoint detector.
 *
 * <p>These cover the decision that replaced the fixed capture window used by
 * the earlier experiment, so a request ends when the user stops speaking instead
 * of after a fixed delay. The onset cases pin down that a run of consecutive
 * speech chunks is required: isolated transients must not start an utterance,
 * and speech inside the hangover restarts the quiet run that ends it.
 */
public class SpeechEndpointDetectorTest {

    private static final float QUIET = 0.001f;
    private static final float SPEECH = 0.2f;

    @Test
    public void doesNotEndBeforeSpeechHasStarted() {
        SpeechEndpointDetector detector = new SpeechEndpointDetector(0.02f, 3, 25);
        for (int index = 0; index < 100; index++) {
            assertFalse(detector.accept(QUIET));
        }
        assertFalse(detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
    }

    @Test
    public void needsConsecutiveSpeechChunksToStartTheUtterance() {
        SpeechEndpointDetector detector = new SpeechEndpointDetector(0.02f, 3, 25);
        detector.accept(SPEECH);
        detector.accept(SPEECH);
        assertFalse("two chunks are below the onset threshold", detector.hasSpeechStarted());
        detector.accept(SPEECH);
        assertTrue(detector.hasSpeechStarted());
    }

    @Test
    public void resetsTheSpeechRunOnQuietChunksBeforeSpeechHasStarted() {
        SpeechEndpointDetector detector = new SpeechEndpointDetector(0.02f, 3, 25);
        // speech, quiet, speech, quiet, speech: three speech chunks in total,
        // but never three in a row, so the utterance must not start.
        detector.accept(SPEECH);
        assertFalse(detector.accept(QUIET));
        detector.accept(SPEECH);
        assertFalse(detector.accept(QUIET));
        detector.accept(SPEECH);
        assertFalse("non-consecutive speech chunks must not start the utterance",
                detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
    }

    @Test
    public void doesNotStartForIsolatedBlips() {
        SpeechEndpointDetector detector = new SpeechEndpointDetector(0.02f, 3, 25);
        for (int blip = 0; blip < 3; blip++) {
            detector.accept(SPEECH);
            for (int index = 0; index < 50; index++) {
                assertFalse(detector.accept(QUIET));
            }
        }
        assertFalse("three isolated transients must not start the utterance",
                detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
    }

    @Test
    public void startsAfterConsecutiveSpeechEvenWhenBlipsCameEarlier() {
        SpeechEndpointDetector detector = new SpeechEndpointDetector(0.02f, 3, 25);
        detector.accept(SPEECH);
        for (int index = 0; index < 25; index++) {
            detector.accept(QUIET);
        }
        assertFalse(detector.hasSpeechStarted());
        for (int index = 0; index < 3; index++) {
            detector.accept(SPEECH);
        }
        assertTrue("a real run of speech starts the utterance", detector.hasSpeechStarted());
    }

    @Test
    public void postOnsetSpeechResetsTheHangoverCounter() {
        SpeechEndpointDetector detector = new SpeechEndpointDetector(0.02f, 3, 25);
        for (int index = 0; index < 3; index++) {
            detector.accept(SPEECH);
        }
        for (int index = 0; index < 24; index++) {
            assertFalse(detector.accept(QUIET));
        }
        // A speech chunk inside the hangover restarts the quiet run.
        assertFalse(detector.accept(SPEECH));
        for (int index = 0; index < 24; index++) {
            assertFalse(detector.accept(QUIET));
        }
        assertTrue("the hangover counts quiet since the last speech chunk",
                detector.accept(QUIET));
        assertTrue(detector.isFinished());
    }

    @Test
    public void endsAfterTheHangoverPeriodOfQuiet() {
        SpeechEndpointDetector detector = new SpeechEndpointDetector(0.02f, 3, 25);
        for (int index = 0; index < 3; index++) {
            detector.accept(SPEECH);
        }
        for (int index = 0; index < 24; index++) {
            assertFalse("quiet is shorter than the hangover", detector.accept(QUIET));
        }
        assertTrue(detector.accept(QUIET));
        assertTrue(detector.isFinished());
    }

    @Test
    public void staysFinishedOnceTheUtteranceHasEnded() {
        SpeechEndpointDetector detector = new SpeechEndpointDetector(0.02f, 3, 25);
        for (int index = 0; index < 3; index++) {
            detector.accept(SPEECH);
        }
        for (int index = 0; index < 25; index++) {
            detector.accept(QUIET);
        }
        assertTrue(detector.accept(SPEECH));
        assertTrue("a finished utterance stays finished", detector.accept(SPEECH));
    }

    @Test
    public void resetsForTheNextUtterance() {
        SpeechEndpointDetector detector = new SpeechEndpointDetector(0.02f, 3, 25);
        for (int index = 0; index < 3; index++) {
            detector.accept(SPEECH);
        }
        for (int index = 0; index < 25; index++) {
            detector.accept(QUIET);
        }
        detector.reset();
        assertFalse(detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
        assertFalse(detector.accept(QUIET));
    }

    @Test
    public void treatsAChunkAtTheThresholdAsSpeech() {
        SpeechEndpointDetector detector = new SpeechEndpointDetector(0.02f, 1, 5);
        assertFalse(detector.accept(0.02f));
        assertTrue("the threshold itself counts as speech", detector.hasSpeechStarted());
    }

    // --- clause-pause regression (20 ms chunks, production 1500 ms hangover) ---

    private static final int CHUNK_MS = 20;
    private static final int PRODUCTION_HANGOVER_CHUNKS = 75;

    private static boolean feedSpeech(SpeechEndpointDetector detector, int milliseconds) {
        boolean ended = false;
        for (int elapsed = 0; elapsed < milliseconds; elapsed += CHUNK_MS) {
            ended |= detector.accept(SPEECH);
        }
        return ended;
    }

    private static boolean feedQuiet(SpeechEndpointDetector detector, int milliseconds) {
        boolean ended = false;
        for (int elapsed = 0; elapsed < milliseconds; elapsed += CHUNK_MS) {
            ended |= detector.accept(QUIET);
        }
        return ended;
    }

    @Test
    public void doesNotEndDuringANaturalClausePause() {
        SpeechEndpointDetector detector =
                new SpeechEndpointDetector(0.02f, 3, PRODUCTION_HANGOVER_CHUNKS);
        assertFalse(feedSpeech(detector, 900));
        // 900 ms is a long clause pause but well below the 1500 ms end threshold.
        assertFalse("a clause pause must not end the utterance", feedQuiet(detector, 900));
        assertFalse(detector.isFinished());
        assertFalse(feedSpeech(detector, 700));
        assertFalse("speech after the pause continues the same utterance",
                feedQuiet(detector, 700));
        assertFalse(detector.isFinished());
    }

    @Test
    public void multiClauseQuestionIsCapturedAsOneUtterance() {
        SpeechEndpointDetector detector =
                new SpeechEndpointDetector(0.02f, 3, PRODUCTION_HANGOVER_CHUNKS);
        // Three spoken clauses separated by typical 400-800 ms pauses. None may
        // end the capture; the user is still asking one compound question.
        assertFalse(feedSpeech(detector, 1800));
        assertFalse("pause 1", feedQuiet(detector, 800));
        assertFalse(feedSpeech(detector, 1500));
        assertFalse("pause 2", feedQuiet(detector, 600));
        assertFalse(feedSpeech(detector, 1200));
        assertFalse("pause 3", feedQuiet(detector, 700));
        assertFalse(detector.isFinished());
        // The real end of the question: silence beyond the hangover.
        assertTrue(feedQuiet(detector, 1500));
        assertTrue(detector.isFinished());
    }

    @Test
    public void shortNoiseBurstBetweenClausesDoesNotEndTheUtterance() {
        SpeechEndpointDetector detector =
                new SpeechEndpointDetector(0.02f, 3, PRODUCTION_HANGOVER_CHUNKS);
        assertFalse(feedSpeech(detector, 600));
        assertFalse(feedQuiet(detector, 1000));
        detector.accept(SPEECH); // one 20 ms transient
        assertFalse(feedQuiet(detector, 1000));
        assertFalse(detector.isFinished());
    }

    @Test
    public void continuousSpeechAtTheMaximumCaptureDurationNeverSelfEnds() {
        SpeechEndpointDetector detector =
                new SpeechEndpointDetector(0.02f, 3, PRODUCTION_HANGOVER_CHUNKS);
        // 30 s of uninterrupted speech: the detector must not end the utterance
        // on its own; only the plugin's MAX_CAPTURE_MS deadline may stop it.
        assertFalse(feedSpeech(detector, 30000));
        assertTrue(detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
    }

    @Test
    public void trailingSilenceEndsExactlyOnce() {
        SpeechEndpointDetector detector =
                new SpeechEndpointDetector(0.02f, 3, PRODUCTION_HANGOVER_CHUNKS);
        assertFalse(feedSpeech(detector, 500));
        assertFalse(feedQuiet(detector, 1479));
        assertTrue(feedQuiet(detector, 20));
        assertTrue(detector.isFinished());
        assertTrue("further silence stays finished", feedQuiet(detector, 1000));
        assertTrue("speech after the end stays finished", detector.accept(SPEECH));
    }

    @Test
    public void isolatedTransientsStillDoNotStartTheUtterance() {
        SpeechEndpointDetector detector =
                new SpeechEndpointDetector(0.02f, 3, PRODUCTION_HANGOVER_CHUNKS);
        for (int burst = 0; burst < 4; burst++) {
            detector.accept(SPEECH);
            feedQuiet(detector, 400);
        }
        assertFalse("short bursts must not satisfy the consecutive onset",
                detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
    }

    @Test
    public void noisyFloorBelowTheThresholdNeverStartsOrEnds() {
        SpeechEndpointDetector detector =
                new SpeechEndpointDetector(0.02f, 3, PRODUCTION_HANGOVER_CHUNKS);
        // Just below the gate for 30 s: background noise must neither start an
        // utterance nor accumulate into a false end.
        for (int index = 0; index < 1500; index++) {
            assertFalse(detector.accept(0.019f));
        }
        assertFalse(detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
    }

    @Test
    public void zeroAmplitudeFramesAreSilenceNotSpeech() {
        SpeechEndpointDetector detector =
                new SpeechEndpointDetector(0.02f, 3, PRODUCTION_HANGOVER_CHUNKS);
        // Empty/blocked reads surface as zero-amplitude chunks in the capture
        // loop; they must never satisfy the onset run.
        for (int index = 0; index < 500; index++) {
            assertFalse(detector.accept(0f));
        }
        assertFalse(detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
    }

    @Test
    public void rejectsAnUnusableConfiguration() {
        assertRejected(0f, 1, 1, "a non-positive threshold");
        assertRejected(-1f, 1, 1, "a negative threshold");
        assertRejected(0.02f, 0, 1, "an onset of zero chunks");
        assertRejected(0.02f, 1, 0, "a hangover of zero chunks");
    }

    private static void assertRejected(float threshold, int onsetChunks, int hangoverChunks, String what) {
        boolean threw = false;
        try {
            new SpeechEndpointDetector(threshold, onsetChunks, hangoverChunks);
        } catch (IllegalArgumentException expected) {
            threw = true;
        }
        assertTrue(what + " must be rejected", threw);
    }
}
