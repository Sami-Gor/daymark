package io.github.sami_gor.daymark.tts;

/**
 * Explicit, injectable state for the optional Kokoro JNI library.
 *
 * <p>Loading used to live in a static initialiser, so a missing or incompatible
 * library threw {@link UnsatisfiedLinkError} while the Capacitor bridge was
 * being constructed and crashed the whole app. Loading is now an operation with
 * a recorded outcome: voice functionality degrades to unavailable, weather and
 * text keep working, and there is no fallback to another speech engine.
 */
public final class NativeLibraryState {

    /** Loads one native library by name or throws. Injectable for tests. */
    public interface Loader {
        void load(String name) throws UnsatisfiedLinkError, SecurityException;
    }

    /** Stable reason codes reported through the bridge. */
    public static final String REASON_NATIVE_UNAVAILABLE = "native-unavailable";
    public static final String REASON_NATIVE_BLOCKED = "native-blocked";

    private static volatile boolean loaded;
    private static volatile String failureReason;
    private static Loader loader = name -> System.loadLibrary(name);

    private NativeLibraryState() {
    }

    /** Replaces the loader; test seam only. */
    public static synchronized void setLoaderForTest(Loader testLoader) {
        loader = testLoader;
        loaded = false;
        failureReason = null;
    }

    /** Restores the system loader and clears state; test seam only. */
    public static synchronized void resetForTest() {
        loader = name -> System.loadLibrary(name);
        loaded = false;
        failureReason = null;
    }

    /**
     * Loads the library once. Safe to call repeatedly and from several threads:
     * a failure is sticky (we never claim availability after it) and a success is
     * recorded once.
     */
    public static boolean ensureLoaded() {
        if (loaded) {
            return true;
        }
        if (failureReason != null) {
            // A missing/incompatible library does not appear later in the same
            // process; retrying would only repeat the same failure.
            return false;
        }
        synchronized (NativeLibraryState.class) {
            if (loaded) {
                return true;
            }
            if (failureReason != null) {
                return false;
            }
            try {
                loader.load("kokoro_jni");
                loaded = true;
                failureReason = null;
                return true;
            } catch (UnsatisfiedLinkError error) {
                failureReason = REASON_NATIVE_UNAVAILABLE;
                return false;
            } catch (SecurityException error) {
                failureReason = REASON_NATIVE_BLOCKED;
                return false;
            }
        }
    }

    public static boolean isLoaded() {
        return loaded;
    }

    /** Null when loaded (or never attempted); a stable reason otherwise. */
    public static String failureReason() {
        return failureReason;
    }
}
