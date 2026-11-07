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

    /** Serialises every native init/release call. */
    public static final Object NATIVE_LOCK = new Object();

    private static long currentGeneration;
    private static boolean initialised;

    private EngineOwnership() {
    }

    /** Allocates an owner token; ownership is committed only after native init succeeds. */
    public static synchronized long beginInit() {
        return currentGeneration + 1;
    }

    /** Commits ownership after a successful native init; call under NATIVE_LOCK. */
    public static synchronized void commitInit(long generation) {
        currentGeneration = generation;
        initialised = true;
    }

    /**
     * True when this generation owns the engine and should release it.
     * Marks the engine unowned so a second release from the same generation is
     * also a no-op. Call under NATIVE_LOCK.
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
