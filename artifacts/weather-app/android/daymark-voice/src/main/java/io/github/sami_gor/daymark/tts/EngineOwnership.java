package io.github.sami_gor.daymark.tts;

import java.util.ArrayDeque;

/**
 * Ownership guard for the process-wide Kokoro native engine.
 *
 * <p>The native bridge keeps exactly one engine and one stream per process
 * (Rust {@code OnceLock} slots), but Java creates one engine object per plugin
 * instance. Android can initialise a replacement while the old instance's
 * callbacks are still on the native surface. The native bridge has no session
 * handle, so Java is the only place that can say which Java generation is
 * allowed to touch the process-global slots.
 *
 * <h2>Generation rules</h2>
 *
 * <p>A reservation is authoritative from the moment it is taken, not from the
 * moment its native initialisation succeeds. {@link #beginInit()} advances the
 * authoritative generation immediately, so every older instance fails
 * {@link #owns(long)} for the whole {@code beginInit -> commitInit} window. A
 * slow or superseded initialisation can therefore never commit, stream, synth
 * or clear a replacement's stream.
 *
 * <p>{@link #claimRelease(long)} is deliberately keyed to the <em>committed</em>
 * generation ({@code currentGeneration}) rather than to the authoritative one:
 * when a replacement reserves, the old native engine is still installed and the
 * old instance must still be allowed to release it. Once the replacement
 * commits, {@code currentGeneration} moves and the stale claim fails.
 *
 * <h2>Operation lease</h2>
 *
 * <p>Native synth/stream calls run outside {@link #NATIVE_LOCK} (they can hold
 * a JNI call for a long time). Before the first call of an operation the engine
 * takes a process-wide lease with {@link #beginOperation(long)}; every native
 * call is preceded by an authority re-check while the lease is held. A reload
 * or shutdown must drain the lease with {@link #awaitDrain(Runnable)} before it
 * may release or replace the engine. The last operation to finish runs the
 * queued transition, so no timeout can ever authorise an unsafe release: a
 * native call that never returns simply leaves the transition pending
 * (fail-closed, never released under a caller).
 *
 * <h2>Stream token</h2>
 *
 * <p>{@link #openStream(long)} records which generation owns the global native
 * stream and returns a monotonic token. Only calls carrying the current token
 * may push, finish, next or clear; beginning a new init/shutdown epoch
 * invalidates every older token, so a stale operation cannot stop or clear a
 * newer stream.
 *
 * <h2>Release-unconfirmed</h2>
 *
 * <p>A throwing native release leaves the process-global native slots in an
 * unknown state. {@link #markReleaseUnconfirmed()} makes that sticky for the
 * rest of the process: every later init, synth, stream and voice registration
 * is refused with {@link #REASON_RELEASE_UNCONFIRMED}, and the failed release
 * is never retried. Only {@link #resetForTest()} clears it; no production
 * recovery path exists because there is no native API that can prove the
 * release actually completed.
 */
public final class EngineOwnership {

    /** Serialises every native init/release call. */
    public static final Object NATIVE_LOCK = new Object();

    /**
     * Stable error code for "a native release threw, the native state is
     * unknown". Reported as an error string; no new plugin API is introduced.
     */
    public static final String REASON_RELEASE_UNCONFIRMED = "native-release-unconfirmed";

    /** Newest token handed out by {@link #beginInit()}. */
    private static long reservedGeneration;
    /** Generation that is allowed to touch the native slots right now. */
    private static long authoritativeGeneration;
    /** Generation of the native engine last committed by {@link #commitInit}. */
    private static long currentGeneration;
    /** True while the committed generation owns a live native engine instance. */
    private static boolean initialised;

    /** Monotonic stream token and its owner; 0 means "no live stream". */
    private static long streamEpoch;
    private static long streamOwner;

    /** Non-null once a native release threw; sticky for the process lifetime. */
    private static String releaseUnconfirmedReason;

    /** Native operations currently admitted and not yet finished. */
    private static int activeOperations;
    /** True while one thread is running the queued drain transitions. */
    private static boolean transitionRunnerActive;
    /** Transitions that must wait for {@link #activeOperations} to reach 0. */
    private static final ArrayDeque<Runnable> pendingTransitions = new ArrayDeque<>();

    private EngineOwnership() {
    }

    /* ------------------------------------------------------------------ *
     * Generation/ownership                                                *
     * ------------------------------------------------------------------ */

    /**
     * Reserves the next owner token and makes it authoritative immediately.
     *
     * <p>The incumbent loses {@link #owns(long)} here, before the replacement
     * native init starts, so an old instance cannot speak, stream, clear or
     * commit during the {@code beginInit -> commitInit} window. Its committed
     * release claim is intentionally kept until a newer generation commits.
     */
    public static synchronized long beginInit() {
        reservedGeneration = Math.max(
                Math.max(reservedGeneration, currentGeneration), authoritativeGeneration) + 1;
        authoritativeGeneration = reservedGeneration;
        // A new initialisation epoch owns (and will replace) the global stream:
        // every token handed out before this point is stale from now on.
        invalidateStreamLocked();
        return reservedGeneration;
    }

    /**
     * Commits ownership after a successful native init; call under
     * {@link #NATIVE_LOCK}. A token older than the newest reservation is
     * rejected and returns false, so a slow stale initialisation can never roll
     * ownership backwards.
     */
    public static synchronized boolean commitInit(long generation) {
        if (generation <= 0
                || generation != reservedGeneration
                || generation != authoritativeGeneration) {
            return false;
        }
        currentGeneration = generation;
        initialised = true;
        return true;
    }

    /**
     * True when this generation owns the native engine and should release it.
     * Marks the engine unowned so a second release from the same generation is
     * also a no-op. Call under {@link #NATIVE_LOCK}.
     *
     * <p>Keyed to the committed generation: a superseding reservation does not
     * steal the old instance's right to release the still-installed engine; a
     * committed replacement does.
     */
    public static synchronized boolean claimRelease(long generation) {
        if (!initialised || generation <= 0 || generation != currentGeneration) {
            return false;
        }
        initialised = false;
        invalidateStreamLocked();
        return true;
    }

    /**
     * True when the generation is committed, is still authoritative and no
     * newer reservation has revoked it. This is the admission predicate for
     * speaking and for native operation leases.
     */
    public static synchronized boolean owns(long generation) {
        return initialised
                && generation > 0
                && generation == currentGeneration
                && generation == authoritativeGeneration;
    }

    /** True when this reservation is the newest and has not been revoked. */
    public static synchronized boolean isAuthoritative(long generation) {
        return generation > 0 && generation == authoritativeGeneration;
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

    /* ------------------------------------------------------------------ *
     * Operation lease                                                     *
     * ------------------------------------------------------------------ */

    /**
     * Admits one native operation for {@code generation}. Call under
     * {@link #NATIVE_LOCK}. Returns false when the generation was superseded,
     * a release is unconfirmed, or the caller is not the committed owner.
     */
    static synchronized boolean beginOperation(long generation) {
        if (releaseUnconfirmedReason != null || !owns(generation)) {
            return false;
        }
        activeOperations += 1;
        return true;
    }

    /**
     * Ends one admitted operation. Returns a runner that drains the queued
     * transitions when this was the last active operation, otherwise null. The
     * caller must release {@link #NATIVE_LOCK} before running it, because the
     * transitions perform their own native init/release under that lock.
     */
    static Runnable endOperation() {
        synchronized (EngineOwnership.class) {
            if (activeOperations > 0) {
                activeOperations -= 1;
            }
            if (activeOperations != 0 || pendingTransitions.isEmpty() || transitionRunnerActive) {
                return null;
            }
            transitionRunnerActive = true;
            return EngineOwnership::runPendingTransitions;
        }
    }

    /**
     * Decides whether a reload/shutdown transition may touch the native engine
     * now. Call under {@link #NATIVE_LOCK} (admission takes the same lock).
     *
     * @return true when no operation is active and the caller may proceed with
     *         the lock still held; false when {@code onDrained} was queued and
     *         will run from the last operation's thread.
     */
    static synchronized boolean awaitDrain(Runnable onDrained) {
        if (activeOperations == 0) {
            return true;
        }
        if (!pendingTransitions.contains(onDrained)) {
            pendingTransitions.add(onDrained);
        }
        return false;
    }

    /**
     * Runs queued transitions one at a time. Stops as soon as a new operation
     * is admitted; that operation's {@link #endOperation()} restarts the runner.
     * Transitions must not hold {@link #NATIVE_LOCK} while this loop picks the
     * next one.
     */
    private static void runPendingTransitions() {
        while (true) {
            Runnable next;
            synchronized (EngineOwnership.class) {
                if (activeOperations > 0) {
                    transitionRunnerActive = false;
                    return;
                }
                next = pendingTransitions.poll();
                if (next == null) {
                    transitionRunnerActive = false;
                    return;
                }
            }
            try {
                next.run();
            } catch (Throwable transitionFailure) {
                // Each transition logs its own failure; one broken continuation
                // must not strand the rest of the queue. The runnable has been
                // removed already, so this cannot spin on the same failure.
                continue;
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * Global stream token                                                 *
     * ------------------------------------------------------------------ */

    /**
     * Starts a new native stream owned by {@code generation} and returns its
     * token, or 0 when the generation may not stream. Call under
     * {@link #NATIVE_LOCK}.
     */
    static synchronized long openStream(long generation) {
        if (!owns(generation)) {
            return 0;
        }
        streamEpoch += 1;
        streamOwner = generation;
        return streamEpoch;
    }

    /** True when {@code token} still names the global stream this generation owns. */
    static synchronized boolean isStreamCurrent(long generation, long token) {
        return token > 0 && token == streamEpoch && generation > 0 && generation == streamOwner;
    }

    /**
     * Retires the stream token if it is still current. Call under
     * {@link #NATIVE_LOCK}; the caller then clears the native slot while still
     * holding the lock. Returns false when a newer generation already owns the
     * stream, in which case the stale caller must not clear it.
     */
    static synchronized boolean closeStream(long generation, long token) {
        if (!isStreamCurrent(generation, token)) {
            return false;
        }
        streamEpoch += 1;
        streamOwner = 0;
        return true;
    }

    private static void invalidateStreamLocked() {
        streamEpoch += 1;
        streamOwner = 0;
    }

    /* ------------------------------------------------------------------ *
     * Release health                                                      *
     * ------------------------------------------------------------------ */

    /**
     * Records that a native release threw. Sticky for the process lifetime:
     * the native slots may still hold a partially released engine, and the
     * bridge offers no way to prove otherwise.
     */
    public static synchronized void markReleaseUnconfirmed() {
        if (releaseUnconfirmedReason == null) {
            releaseUnconfirmedReason = REASON_RELEASE_UNCONFIRMED;
        }
    }

    public static synchronized boolean isReleaseUnconfirmed() {
        return releaseUnconfirmedReason != null;
    }

    /** Null while native release state is confirmed; a stable reason otherwise. */
    public static synchronized String releaseUnconfirmedReason() {
        return releaseUnconfirmedReason;
    }

    /* ------------------------------------------------------------------ *
     * Test seam                                                           *
     * ------------------------------------------------------------------ */

    /**
     * Clears all process-global state. This is a JVM-test seam only: production
     * never resets a release-unconfirmed process because no safe native reset
     * exists.
     */
    public static synchronized void resetForTest() {
        currentGeneration = 0;
        reservedGeneration = 0;
        authoritativeGeneration = 0;
        initialised = false;
        streamEpoch = 0;
        streamOwner = 0;
        releaseUnconfirmedReason = null;
        activeOperations = 0;
        transitionRunnerActive = false;
        pendingTransitions.clear();
    }
}
