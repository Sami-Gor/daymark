package io.github.sami_gor.daymark.tts;

/**
 * Small native abstraction for local (on-device) speech synthesis.
 *
 * The rest of the app only ever talks to this interface, so the Sherpa-ONNX
 * implementation can be replaced later without touching UI code. This is a
 * proof-of-concept boundary, not a production integration.
 */
public interface LocalTtsEngine {

    enum State {
        UNINITIALIZED,
        LOADING,
        READY,
        SPEAKING,
        STOPPED,
        ERROR,
    }

    interface Listener {
        /** Always delivered on the main thread. */
        void onStateChanged(State state);

        /** Always delivered on the main thread. */
        void onError(String message);

        /** Development instrumentation; always delivered on the main thread. */
        default void onAudioMeasured(long generationMs, long audioDurationMs) {
        }
    }

    /** Loads model assets asynchronously. Never call from the main thread. */
    void initialize(Listener listener);

    /** Synthesizes and plays the given text; generation happens off the UI thread. */
    void speak(String text);

    /** Stops playback immediately if speaking. */
    void stop();

    boolean isSpeaking();

    /** Releases native resources and stops the worker thread. */
    void shutdown();
}
