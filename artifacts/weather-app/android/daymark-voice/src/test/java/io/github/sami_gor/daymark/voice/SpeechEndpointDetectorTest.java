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
