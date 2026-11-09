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
    private static long reservedGeneration;
    private static boolean initialised;

    private EngineOwnership() {
    }

    /**
     * Reserves the next owner token; ownership is committed only after native
     * init succeeds. Reserving immediately supersedes every older token: two
     * concurrent initialisations must never receive the same generation.
     */
    public static synchronized long beginInit() {
        reservedGeneration = Math.max(reservedGeneration, currentGeneration) + 1;
        return reservedGeneration;
    }

    /**
     * Commits ownership after a successful native init; call under NATIVE_LOCK.
     * A token older than the newest reservation is rejected and returns false,
     * so a slow stale initialisation can never roll ownership backwards.
     */
    public static synchronized boolean commitInit(long generation) {
        if (generation != reservedGeneration) {
            return false;
        }
        currentGeneration = generation;
        initialised = true;
        return true;
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

    /**
     * True when this token is still the newest reservation. Callers check this
     * under {@link #NATIVE_LOCK} immediately before touching the native engine,
     * so a slow, superseded initialisation cannot overwrite or release the
     * engine a newer generation is about to own.
     */
    public static synchronized boolean isLatestReservation(long generation) {
        return generation > 0 && generation == reservedGeneration;
    }

    public static synchronized long currentGeneration() {
        return currentGeneration;
    }

    public static synchronized long reservedGeneration() {
        return reservedGeneration;
    }

    public static synchronized void resetForTest() {
        currentGeneration = 0;
        reservedGeneration = 0;
        initialised = false;
    }
}
