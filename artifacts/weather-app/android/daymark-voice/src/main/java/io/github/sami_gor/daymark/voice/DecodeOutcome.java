package io.github.sami_gor.daymark.voice;

/**
 * Structured result of decoding one utterance.
 *
 * <p>Previously, the decoder used to return a bare {@code String}, and the
 * plugin treated a {@code null} or empty string as {@code no-speech} — the same
 * code it uses for a capture that never contained speech. That conflates three
 * different outcomes, one of which is a security refusal:
 *
 * <ul>
 *   <li>the native decoder <em>refused</em> the model / encoder output (the
 *       patched sherpa-onnx decoders log and return an empty result);</li>
 *   <li>the decode call <em>failed</em> before returning a result;</li>
 *   <li>the decode <em>completed</em> without producing any text; and</li>
 *   <li>the utterance contained no speech at all (handled before the decode,
 *       by the endpoint detector).</li>
 * </ul>
 *
 * <p>This type carries that distinction to the plugin, which maps it to the
 * stable error codes in {@link RecognitionErrorCodes}. A refusal or a failed
 * decode must never be delivered as a transcript, and must never be reported
 * as silence.
 *
 * <p>{@link #detail()} is a fixed, non-sensitive diagnostic string. It never
 * contains audio, a transcript or exception text.
 */
final class DecodeOutcome {

    /** The four terminal shapes of one decode call. */
    enum Status {
        /** The decoder produced non-empty text. */
        DECODED,
        /** The decode completed successfully but produced no text. */
        EMPTY,
        /** The native decoder refused the model or the encoder output. */
        REFUSED,
        /** The decode call failed before it could produce a result. */
        FAILED
    }

    /** Fixed diagnostics; deliberately free of payload and exception text. */
    static final String DETAIL_NATIVE_REFUSAL = "native decoder refused the utterance";
    static final String DETAIL_NATIVE_FAILURE = "native decode call failed";

    private final Status status;
    private final String text;
    private final String detail;

    private DecodeOutcome(Status status, String text, String detail) {
        this.status = status;
        this.text = text;
        this.detail = detail;
    }

    /** A successful decode with a non-empty transcript. */
    static DecodeOutcome decoded(String transcript) {
        return new DecodeOutcome(Status.DECODED, transcript == null ? "" : transcript, "");
    }

    /** A decode that completed without producing any text. */
    static DecodeOutcome empty() {
        return new DecodeOutcome(Status.EMPTY, "", "");
    }

    /** A decode the native decoder refused for security reasons. */
    static DecodeOutcome refused(String detail) {
        return new DecodeOutcome(Status.REFUSED, "", detail == null ? "" : detail);
    }

    /** A decode call that failed (for example a native exception). */
    static DecodeOutcome failed(String detail) {
        return new DecodeOutcome(Status.FAILED, "", detail == null ? "" : detail);
    }

    Status status() {
        return status;
    }

    /** The transcript for {@link Status#DECODED}; empty otherwise. */
    String text() {
        return text;
    }

    /** Non-sensitive diagnostic for {@link Status#REFUSED}/{@link Status#FAILED}. */
    String detail() {
        return detail;
    }
}
