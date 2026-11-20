package io.github.sami_gor.daymark.voice;

/**
 * Stable recognition error codes shared by the Android plugin and the web
 * layer (mirrored in {@code src/lib/recognition-errors.ts}).
 *
 * <p>Previously, an empty or failed decode was reported as {@code no-speech}, so
 * callers could not distinguish a failed decode from silence. The contract below keeps
 * the pre-existing codes for existing conditions and adds three codes that
 * were previously collapsed into {@code no-speech} or {@code unknown}:
 *
 * <ul>
 *   <li>{@link #MODEL_REJECTED} — the native decoder refused the model / the
 *       encoder output. This is the security-refusal code. It is never an
 *       empty transcript and never silence.</li>
 *   <li>{@link #DECODE_FAILED} — the decode call failed (for example a native
 *       exception). Also a failure, never a transcript.</li>
 *   <li>{@link #EMPTY_TRANSCRIPT} — the decode completed without text although
 *       speech was detected. This is a distinct, user-visible failure state,
 *       not silence. With the shipped AAR it is also the fallback bucket for a
 *       silent native refusal (see {@link NativeDecodeStatus}).</li>
 * </ul>
 *
 * <p>{@link #NO_SPEECH} keeps its old meaning: the endpoint detector never saw
 * speech, so no decode was attempted.
 *
 * <p>Adding codes is backward compatible on the bridge: the web layer passes
 * unknown codes through to its generic failure copy, and existing codes are
 * unchanged. Changing which code is emitted for a post-speech empty decode is
 * a deliberate, documented behaviour change.
 */
final class RecognitionErrorCodes {

    /** No speech was detected; no decode ran. Genuine silence. */
    static final String NO_SPEECH = "no-speech";
    /** A decode ran (after speech onset) but produced no text. */
    static final String EMPTY_TRANSCRIPT = "empty-transcript";
    /** The native decoder refused the model / encoder output. */
    static final String MODEL_REJECTED = "model-rejected";
    /** The decode call itself failed. */
    static final String DECODE_FAILED = "decode-failed";

    /** The microphone could not be started or read. */
    static final String AUDIO_CAPTURE = "audio-capture";
    /** Microphone permission was lost at start time. */
    static final String NOT_ALLOWED = "not-allowed";
    /** A permission request was denied (can ask again). */
    static final String PERMISSION_DENIED = "permission-denied";
    /** A permission request can no longer prompt; the user must use Settings. */
    static final String PERMISSION_BLOCKED = "permission-blocked";
    /** The recogniser is unavailable (released, model missing, runtime gone). */
    static final String OFFLINE_UNAVAILABLE = "offline-unavailable";
    /** The session was cancelled or the activity went away. */
    static final String ABORTED = "aborted";
    /** A second session was requested while one is live. */
    static final String SESSION_BUSY = "session-busy";
    /** The session id on the bridge call was invalid. */
    static final String INVALID_SESSION = "invalid-session";

    private RecognitionErrorCodes() {
    }

    /**
     * The processing stage a code belongs to. Additive bridge metadata: the
     * web layer can distinguish a capture failure from a decode failure from a
     * model failure without parsing the code.
     */
    enum Stage {
        CAPTURE("capture"),
        DECODE("decode"),
        MODEL("model"),
        SESSION("session"),
        UNKNOWN("unknown");

        private final String wireName;

        Stage(String wireName) {
            this.wireName = wireName;
        }

        String wireName() {
            return wireName;
        }
    }

    /** Maps a code to the stage that produced it. */
    static Stage stageOf(String code) {
        if (code == null) {
            return Stage.UNKNOWN;
        }
        switch (code) {
            case NO_SPEECH:
            case AUDIO_CAPTURE:
            case NOT_ALLOWED:
            case PERMISSION_DENIED:
            case PERMISSION_BLOCKED:
            case ABORTED:
                return Stage.CAPTURE;
            case EMPTY_TRANSCRIPT:
            case MODEL_REJECTED:
            case DECODE_FAILED:
                return Stage.DECODE;
            case OFFLINE_UNAVAILABLE:
                return Stage.MODEL;
            case SESSION_BUSY:
            case INVALID_SESSION:
                return Stage.SESSION;
            default:
                return Stage.UNKNOWN;
        }
    }
}
