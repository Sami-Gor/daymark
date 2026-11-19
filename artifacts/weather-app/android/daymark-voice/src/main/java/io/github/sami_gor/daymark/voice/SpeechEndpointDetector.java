package io.github.sami_gor.daymark.voice;

/**
 * Decides when a recorded utterance has ended.
 *
 * <p>The offline transducer decodes a complete utterance, so the recorder has to
 * decide when the user has stopped speaking. The previous experiment used a fixed
 * capture window, which made every request take the full window and gave the user
 * no early response.
 *
 * <p>This detector is a simple energy gate: a read counts as speech when its
 * root-mean-square amplitude reaches a threshold. An utterance ends once speech
 * has been seen and the signal has then stayed quiet for a hangover period, which
 * keeps the closing consonants of a word from truncating the utterance.
 *
 * <p>Endpoint timing is based on the actual number of captured frames supplied by
 * the caller, not on the number of reads. A short read contributes only its real
 * audio duration. The onset and hangover thresholds are configured in
 * milliseconds and converted with the recorder sample rate.
 *
 * <p>Onset must be consecutive: quiet frames before the utterance has started
 * reset the speech run, so isolated transients (taps, clicks, a cough) never
 * count towards it. Once the utterance has started, speech frames reset the
 * quiet run that ends it.
 *
 * <p>The class holds no Android types, so it is covered by plain JVM unit tests.
 */
public final class SpeechEndpointDetector {

    private final float threshold;
    private final int onsetFrames;
    private final int hangoverFrames;

    private int speechFrames;
    private int quietFrames;
    private boolean speechStarted;
    private boolean finished;

    /**
     * @param threshold     root-mean-square amplitude at or above which audio counts as speech
     * @param sampleRate    capture sample rate in Hz, used to convert milliseconds to frames
     * @param onsetMs       consecutive speech duration required before an utterance starts
     * @param hangoverMs    quiet duration required after speech to end the utterance
     */
    public SpeechEndpointDetector(
            float threshold,
            int sampleRate,
            int onsetMs,
            int hangoverMs) {
        if (threshold <= 0f) {
            throw new IllegalArgumentException("threshold must be positive");
        }
        if (sampleRate <= 0) {
            throw new IllegalArgumentException("sampleRate must be positive");
        }
        if (onsetMs <= 0) {
            throw new IllegalArgumentException("onsetMs must be positive");
        }
        if (hangoverMs <= 0) {
            throw new IllegalArgumentException("hangoverMs must be positive");
        }
        this.threshold = threshold;
        this.onsetFrames = Math.max(1, (int) Math.round(sampleRate * (onsetMs / 1000.0)));
        this.hangoverFrames = Math.max(1, (int) Math.round(sampleRate * (hangoverMs / 1000.0)));
    }

    /**
     * Feeds one read into the detector.
     *
     * @param rootMeanSquare amplitude of the captured audio
     * @param frameCount    actual number of PCM frames supplied; zero is a no-op
     * @return true once the utterance has ended
     * @throws IllegalArgumentException if {@code frameCount} is negative
     */
    public boolean accept(float rootMeanSquare, int frameCount) {
        if (frameCount < 0) {
            throw new IllegalArgumentException("frameCount must not be negative");
        }
        if (frameCount == 0 || finished) {
            return finished;
        }
        if (rootMeanSquare >= threshold) {
            speechFrames += frameCount;
            quietFrames = 0;
            if (speechFrames >= onsetFrames) {
                speechStarted = true;
            }
            return false;
        }
        quietFrames += frameCount;
        if (!speechStarted) {
            // Onset is consecutive: quiet frames break the run of speech, so
            // a later run starts counting from zero again. Without this,
            // isolated transients anywhere in the capture window would add up
            // to a "started" utterance.
            speechFrames = 0;
        }
        if (speechStarted && quietFrames >= hangoverFrames) {
            finished = true;
            return true;
        }
        return false;
    }

    /** Whether speech was detected in the utterance. */
    public boolean hasSpeechStarted() {
        return speechStarted;
    }

    /** Whether the utterance has ended. */
    public boolean isFinished() {
        return finished;
    }

    /** Resets the detector so it can be reused for the next utterance. */
    public void reset() {
        speechFrames = 0;
        quietFrames = 0;
        speechStarted = false;
        finished = false;
    }
}
