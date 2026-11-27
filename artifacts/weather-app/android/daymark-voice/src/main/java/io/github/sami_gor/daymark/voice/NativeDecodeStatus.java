package io.github.sami_gor.daymark.voice;

/**
 * Optional native decode-status channel used by the JVM adapter.
 *
 * <p>This is the integration seam for this change at the native boundary. The
 * patched sherpa-onnx decoders (CVE-2026-108954 fix) log a refusal and return
 * an empty result set; the shipped {@code sherpa-onnx-1.13.8} AAR's Java API
 * ({@code OfflineRecognizer.decode(stream)} returning {@code void}, then
 * {@code getResult(stream)}) exposes no status, so the JVM cannot observe a
 * refusal with that AAR. A refusal then reaches the app as
 * {@link #UNAVAILABLE}: an empty decode is reported as
 * {@link RecognitionErrorCodes#EMPTY_TRANSCRIPT}, which is a failure state,
 * never silence and never a transcript.
 *
 * <p>When the native layer grows a refusal status — for example a JNI
 * {@code decode} returning an int status, or a per-stream error field — the
 * production adapter only needs to implement this interface and pass it to the
 * decoder; the plugin, the bridge payload and the web mapping do not change.
 * The JVM tests exercise the REFUSED mapping with a deterministic fake status
 * and a fake decoder, because the native runtime is not available on the host.
 */
interface NativeDecodeStatus {

    /**
     * The production value while the shipped AAR exposes no status: a native
     * refusal cannot be distinguished from an empty decode at this boundary.
     */
    NativeDecodeStatus UNAVAILABLE = new NativeDecodeStatus() {
        @Override
        public boolean refusedLastDecode() {
            return false;
        }

        @Override
        public boolean isObservable() {
            return false;
        }
    };

    /** Whether the native decoder reported a refusal for the last decode. */
    boolean refusedLastDecode();

    /**
     * Whether this channel can report refusals at all. False documents the
     * current AAR limitation instead of silently pretending refusals cannot
     * happen.
     */
    boolean isObservable();
}
