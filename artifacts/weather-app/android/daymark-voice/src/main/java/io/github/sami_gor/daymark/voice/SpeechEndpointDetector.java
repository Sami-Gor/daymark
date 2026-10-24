package io.github.sami_gor.daymark.voice;

/**
 * Decides when a recorded utterance has ended.
 *
 * <p>The offline transducer decodes a complete utterance, so the recorder has to
 * decide when the user has stopped speaking. The previous experiment used a fixed
 * capture window, which made every request take the full window and gave the user
 * no early response.
 *
 * <p>This detector is a simple energy gate: a chunk counts as speech when its
 * root-mean-square amplitude reaches a threshold. An utterance ends once speech
 * has been seen and the signal has then stayed quiet for a hangover period, which
 * keeps the closing consonants of a word from truncating the utterance.
 *
 * <p>Onset must be consecutive: quiet chunks before the utterance has started
 * reset the speech run, so isolated transients (taps, clicks, a cough) never
 * count towards it. Once the utterance has started, a speech chunk resets the
 * quiet run that ends it.
 *
 * <p>The class holds no Android types, so it is covered by plain JVM unit tests.
 */
public final class SpeechEndpointDetector {

    private final float threshold;
    private final int onsetChunks;
    private final int hangoverChunks;

    private int speechChunks;
    private int quietChunks;
    private boolean speechStarted;
    private boolean finished;

    /**
     * @param threshold     root-mean-square amplitude at or above which a chunk counts as speech
     * @param onsetChunks   consecutive speech chunks required before the utterance is considered started
     * @param hangoverChunks consecutive quiet chunks required after speech to end the utterance
     */
    public SpeechEndpointDetector(float threshold, int onsetChunks, int hangoverChunks) {
        if (threshold <= 0f) {
            throw new IllegalArgumentException("threshold must be positive");
        }
        if (onsetChunks < 1) {
            throw new IllegalArgumentException("onsetChunks must be at least 1");
        }
        if (hangoverChunks < 1) {
            throw new IllegalArgumentException("hangoverChunks must be at least 1");
        }
        this.threshold = threshold;
        this.onsetChunks = onsetChunks;
        this.hangoverChunks = hangoverChunks;
    }

    /**
     * Feeds one chunk into the detector.
     *
     * @param rootMeanSquare amplitude of the chunk
     * @return true once the utterance has ended
     */
    public boolean accept(float rootMeanSquare) {
        if (finished) {
            return true;
        }
        if (rootMeanSquare >= threshold) {
            speechChunks++;
            quietChunks = 0;
            if (speechChunks >= onsetChunks) {
                speechStarted = true;
            }
            return false;
        }
        quietChunks++;
        if (!speechStarted) {
            // Onset is consecutive: a quiet chunk breaks the run of speech, so
            // a later chunk starts counting from zero again. Without this,
            // isolated transients anywhere in the capture window would add up
            // to a "started" utterance.
            speechChunks = 0;
        }
        if (speechStarted && quietChunks >= hangoverChunks) {
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
        speechChunks = 0;
        quietChunks = 0;
        speechStarted = false;
        finished = false;
    }
}
