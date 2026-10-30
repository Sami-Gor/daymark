package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Unit tests for the frame-duration utterance endpoint detector.
 *
 * <p>The production detector uses actual frame counts, so these tests exercise
 * full and short reads, one-second clause pauses, the exact 1,500 ms hangover,
 * zero-length reads, and continuous speech. The same amount of audio must
 * produce the same decision regardless of how it is divided into reads.
 */
public class SpeechEndpointDetectorTest {

    private static final float QUIET = 0.001f;
    private static final float SPEECH = 0.2f;
    private static final int SAMPLE_RATE = 16_000;
    private static final int ONSET_MS = 60;
    private static final int HANGOVER_MS = 1_500;

    private static SpeechEndpointDetector detector() {
        return new SpeechEndpointDetector(
                0.02f, SAMPLE_RATE, ONSET_MS, HANGOVER_MS);
    }

    private static int frames(int milliseconds) {
        return (int) Math.round(SAMPLE_RATE * (milliseconds / 1000.0));
    }

    private static boolean feed(
            SpeechEndpointDetector detector,
            float rootMeanSquare,
            int totalFrames,
            int readFrames) {
        if (totalFrames < 0 || readFrames <= 0) {
            throw new IllegalArgumentException("invalid test feed");
        }
        boolean ended = false;
        int remaining = totalFrames;
        while (remaining > 0) {
            int count = Math.min(readFrames, remaining);
            ended |= detector.accept(rootMeanSquare, count);
            remaining -= count;
        }
        return ended;
    }

    @Test
    public void doesNotEndBeforeSpeechHasStarted() {
        SpeechEndpointDetector detector = detector();
        for (int index = 0; index < 100; index++) {
            assertFalse(detector.accept(QUIET, 320));
        }
        assertFalse(detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
    }

    @Test
    public void needsConsecutiveSpeechFramesToStartTheUtterance() {
        SpeechEndpointDetector detector = detector();
        // 959 frames is just below the 960-frame / 60 ms onset threshold.
        assertFalse(detector.accept(SPEECH, 959));
        assertFalse(detector.hasSpeechStarted());
        assertFalse(detector.accept(SPEECH, 1));
        assertTrue(detector.hasSpeechStarted());
    }

    @Test
    public void resetsTheSpeechRunOnQuietFramesBeforeSpeechHasStarted() {
        SpeechEndpointDetector detector = detector();
        assertFalse(detector.accept(SPEECH, 320));
        assertFalse(detector.accept(QUIET, 320));
        assertFalse(detector.accept(SPEECH, 320));
        assertFalse(detector.accept(QUIET, 320));
        assertFalse(detector.accept(SPEECH, 320));
        assertFalse("non-consecutive speech must not start the utterance",
                detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
    }

    @Test
    public void doesNotStartForIsolatedBlips() {
        SpeechEndpointDetector detector = detector();
        for (int blip = 0; blip < 3; blip++) {
            detector.accept(SPEECH, 320);
            assertFalse(feed(detector, QUIET, frames(1000), 320));
        }
        assertFalse("three isolated transients must not start the utterance",
                detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
    }

    @Test
    public void startsAfterConsecutiveSpeechEvenWhenBlipsCameEarlier() {
        SpeechEndpointDetector detector = detector();
        detector.accept(SPEECH, 320);
        assertFalse(feed(detector, QUIET, frames(500), 320));
        assertFalse(detector.hasSpeechStarted());
        assertFalse(feed(detector, SPEECH, frames(60), 320));
        assertTrue("a real run of speech starts the utterance", detector.hasSpeechStarted());
    }

    @Test
    public void postOnsetSpeechResetsTheQuietFrames() {
        SpeechEndpointDetector detector = detector();
        assertFalse(feed(detector, SPEECH, frames(300), 320));
        assertEquals(false, feed(detector, QUIET, frames(1499), 320));
        assertFalse(detector.accept(SPEECH, 1));
        assertEquals(false, feed(detector, QUIET, frames(1499), 320));
        assertTrue(detector.accept(QUIET, frames(1)));
        assertTrue(detector.isFinished());
    }

    @Test
    public void normalFullReadsEndAtTheExactHangover() {
        SpeechEndpointDetector detector = detector();
        assertFalse(feed(detector, SPEECH, frames(300), 320));
        assertFalse(feed(detector, QUIET, frames(1499), 320));
        assertTrue(detector.accept(QUIET, frames(1)));
        assertTrue(detector.isFinished());
    }

    @Test
    public void oneSecondPauseBetweenClausesDoesNotEndTheUtterance() {
        SpeechEndpointDetector detector = detector();
        assertFalse(feed(detector, SPEECH, frames(900), 320));
        assertFalse("a one-second clause pause must not end the utterance",
                feed(detector, QUIET, frames(1000), 320));
        assertFalse(detector.isFinished());
        assertFalse(feed(detector, SPEECH, frames(700), 320));
        assertFalse(feed(detector, QUIET, frames(700), 320));
        assertFalse(detector.isFinished());
    }

    @Test
    public void completeMultiClauseQuestionIsOneUtterance() {
        SpeechEndpointDetector detector = detector();
        assertFalse(feed(detector, SPEECH, frames(1800), 320));
        assertFalse("pause 1", feed(detector, QUIET, frames(800), 320));
        assertFalse(feed(detector, SPEECH, frames(1500), 320));
        assertFalse("pause 2", feed(detector, QUIET, frames(600), 320));
        assertFalse(feed(detector, SPEECH, frames(1200), 320));
        assertFalse("pause 3", feed(detector, QUIET, frames(700), 320));
        assertFalse(detector.isFinished());
        assertTrue("the final silence ends the question once",
                feed(detector, QUIET, frames(1500), 320));
        assertTrue(detector.isFinished());
    }

    @Test
    public void shortReadsHaveTheSameAudioDurationAsFullReads() {
        for (int readFrames : new int[] { 320, 160, 80, 1 }) {
            SpeechEndpointDetector detector = detector();
            assertFalse("speech at " + readFrames + " frames/read",
                    feed(detector, SPEECH, frames(300), readFrames));
            assertFalse("1000 ms pause at " + readFrames + " frames/read",
                    feed(detector, QUIET, frames(1000), readFrames));
            assertFalse(detector.isFinished());
            assertTrue("remaining 500 ms at " + readFrames + " frames/read",
                    feed(detector, QUIET, frames(500), readFrames));
            assertTrue(detector.isFinished());
        }
    }

    @Test
    public void zeroLengthReadsAreNoOps() {
        SpeechEndpointDetector detector = detector();
        assertFalse(feed(detector, SPEECH, frames(60), 320));
        assertFalse(detector.accept(QUIET, 0));
        assertFalse(detector.isFinished());
        assertTrue(feed(detector, QUIET, frames(1500), 320));
        assertTrue(detector.isFinished());
        assertTrue("zero after completion remains completed", detector.accept(QUIET, 0));
    }

    @Test
    public void continuousSpeechForThirtySecondsNeverSelfEnds() {
        for (int readFrames : new int[] { 320, 160, 80 }) {
            SpeechEndpointDetector detector = detector();
            assertFalse(feed(detector, SPEECH, frames(30_000), readFrames));
            assertTrue(detector.hasSpeechStarted());
            assertFalse(detector.isFinished());
        }
    }

    @Test
    public void trailingSilenceEndsExactlyOnce() {
        SpeechEndpointDetector detector = detector();
        assertFalse(feed(detector, SPEECH, frames(500), 320));
        assertFalse(feed(detector, QUIET, frames(1499), 320));
        assertTrue(detector.accept(QUIET, frames(1)));
        assertTrue(detector.isFinished());
        assertTrue("further silence stays finished", detector.accept(QUIET, frames(1000)));
        assertTrue("speech after the end stays finished", detector.accept(SPEECH, frames(320)));
    }

    @Test
    public void treatsAThresholdFrameAsSpeech() {
        SpeechEndpointDetector detector = detector();
        assertFalse(detector.accept(0.02f, 1));
        assertFalse(detector.hasSpeechStarted());
        assertFalse(feed(detector, 0.02f, frames(59), 320));
        assertFalse(feed(detector, 0.02f, frames(1), 320));
        assertTrue("the threshold itself counts as speech", detector.hasSpeechStarted());
    }

    @Test
    public void resetsForTheNextUtterance() {
        SpeechEndpointDetector detector = detector();
        assertFalse(feed(detector, SPEECH, frames(60), 320));
        assertTrue(feed(detector, QUIET, frames(1500), 320));
        detector.reset();
        assertFalse(detector.hasSpeechStarted());
        assertFalse(detector.isFinished());
        assertFalse(detector.accept(QUIET, 320));
    }

    @Test
    public void rejectsNegativeFrameCount() {
        SpeechEndpointDetector detector = detector();
        boolean threw = false;
        try {
            detector.accept(SPEECH, -1);
        } catch (IllegalArgumentException expected) {
            threw = true;
        }
        assertTrue("negative frame counts must be rejected", threw);
    }

    @Test
    public void rejectsUnusableConfiguration() {
        assertRejected(0f, 16_000, 60, 1500, "non-positive threshold");
        assertRejected(0.02f, 0, 60, 1500, "non-positive sample rate");
        assertRejected(0.02f, 16_000, 0, 1500, "non-positive onset");
        assertRejected(0.02f, 16_000, 60, 0, "non-positive hangover");
    }

    private static void assertRejected(
            float threshold,
            int sampleRate,
            int onsetMs,
            int hangoverMs,
            String what) {
        boolean threw = false;
        try {
            new SpeechEndpointDetector(threshold, sampleRate, onsetMs, hangoverMs);
        } catch (IllegalArgumentException expected) {
            threw = true;
        }
        assertTrue(what + " must be rejected", threw);
    }
}
