package io.github.sami_gor.daymark.tts;

/**
 * Ownership guard for the process-wide Kokoro native engine.
 *
 * <p>The native bridge keeps exactly one engine per process, but Java creates an
 * engine object per plugin instance. When Android recreates the Activity after a
 * renderer failure, the replacement initialises a new engine while the old
 * instance is still being destroyed; the old instance's release would then null
 * the replacement's engine and narration died for the rest of the process.
 *
 * <p>Every initialisation takes the next generation. A release only reaches the
 * native bridge if its generation is still current, so a stale release is a
 * no-op. This is the Java-side control; the native surface still holds one
 * engine, so only one live instance is permitted at a time.
 */
public final class EngineOwnership {

    private static long currentGeneration;
    private static boolean initialised;

    private EngineOwnership() {
    }

    /** Registers a new owner and returns its generation. */
    public static synchronized long beginInit() {
        currentGeneration += 1;
        initialised = true;
        return currentGeneration;
    }

    /**
     * True when this generation owns the engine and should release it.
     * Marks the engine unowned so a second release from the same generation is
     * also a no-op.
     */
    public static synchronized boolean claimRelease(long generation) {
        if (!initialised || generation != currentGeneration) {
            return false;
        }
        initialised = false;
        return true;
    }

    /** True when the generation still owns the engine (e.g. before speaking). */
    public static synchronized boolean owns(long generation) {
        return initialised && generation == currentGeneration;
    }

    public static synchronized long currentGeneration() {
        return currentGeneration;
    }

    public static synchronized void resetForTest() {
        currentGeneration = 0;
        initialised = false;
    }
}
