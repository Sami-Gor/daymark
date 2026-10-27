package io.github.sami_gor.daymark.tts;

/**
 * Loads the Kokoro JNI library (libkokoro_jni.so) once per process and
 * reports whether it could be linked.
 *
 * The library is built for arm64-v8a only
 * (android/kokoro-poc/scripts/build-kokoro-android.sh) and is not committed.
 * A build for any other ABI — deliberately, for the x86_64 emulator used by
 * the API 30 location smoke workflow — therefore cannot contain it. The
 * previous {@code System.loadLibrary} in {@link KokoroLocalTtsEngine}'s
 * static initializer threw {@link UnsatisfiedLinkError} during class
 * initialization, which crashed the app at startup before the WebView ever
 * rendered. Moving the load here turns the same failure into a queryable
 * "voice unavailable" state instead.
 *
 * This class deliberately has no Android imports: the JVM unit-test
 * environment never has libkokoro_jni.so on its library path, so touching
 * it there exercises exactly the missing-library path without any device.
 */
public final class KokoroNativeLibrary {

    private static final boolean AVAILABLE;
    private static final String LOAD_FAILURE;

    static {
        boolean available = false;
        String failure = null;
        try {
            System.loadLibrary("kokoro_jni");
            available = true;
        } catch (UnsatisfiedLinkError error) {
            // Expected for any build that does not package the arm64-v8a
            // library (for example the x86_64 CI smoke build). Report it,
            // never propagate it: the app must boot and degrade gracefully.
            failure = error.getMessage();
        }
        AVAILABLE = available;
        LOAD_FAILURE = failure;
    }

    private KokoroNativeLibrary() {}

    /** Whether libkokoro_jni.so is linked in this process. */
    public static boolean isAvailable() {
        return AVAILABLE;
    }

    /**
     * Why the library could not be linked, or {@code null} when it was.
     * For logging only; never shown to the web layer.
     */
    public static String loadFailure() {
        return LOAD_FAILURE;
    }
}
