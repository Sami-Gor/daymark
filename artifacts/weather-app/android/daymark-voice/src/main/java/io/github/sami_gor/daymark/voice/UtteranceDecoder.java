package io.github.sami_gor.daymark.voice;

/**
 * Decodes one complete utterance and, when discarded, frees the recogniser.
 *
 * <p>Package-private seam: the capture worker drives the recogniser through
 * this interface so the teardown lifecycle (destroy while a decode is in
 * flight, a build completing after release) can be unit-tested on the JVM
 * with a fake recogniser instead of the sherpa native runtime. Production
 * uses the adapter inside {@link ParakeetSpeechRecognitionPlugin}.
 *
 * <p>The return type is a {@link DecodeOutcome}, not a bare string: this change
 * is exactly the case where a decoder refusal was flattened into an empty
 * string and then reported as silence. Callers must branch on
 * {@link DecodeOutcome.Status} and must never deliver an empty transcript.
 */
interface UtteranceDecoder {

    /**
     * Decodes the given utterance.
     *
     * @param samples    PCM samples of the whole utterance
     * @param sampleRate sample rate the samples were captured at
     * @return the structured decode outcome; never {@code null}
     */
    DecodeOutcome decode(float[] samples, int sampleRate);

    /** Releases the underlying recogniser. Idempotent. */
    void release();
}
