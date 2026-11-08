package io.github.sami_gor.daymark.tts;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Generation-guarded, single-flight reload token.
 *
 * <p>Only one registration/reload may be in flight at a time. A caller that
 * loses the race receives {@code operation-conflict} instead of queueing work
 * behind playback. Results from a superseded generation are ignored, so a stale
 * callback can never complete into a newer engine instance.
 */
public final class ReloadGuard {

    private final AtomicLong current = new AtomicLong(0);
    private volatile long inFlight = -1;

    /** Starts a reload, or returns -1 when one is already running. */
    public long tryBegin() {
        synchronized (this) {
            if (inFlight != -1) {
                return -1;
            }
            long token = current.incrementAndGet();
            inFlight = token;
            return token;
        }
    }

    /** True when {@code token} is still the newest generation. */
    public boolean isCurrent(long token) {
        return token > 0 && current.get() == token;
    }

    /** Releases the single-flight slot; safe to call for stale tokens. */
    public void finish(long token) {
        synchronized (this) {
            if (inFlight == token) {
                inFlight = -1;
            }
        }
    }

    /** Invalidates all outstanding tokens (e.g. engine release). */
    public void invalidate() {
        synchronized (this) {
            current.incrementAndGet();
            inFlight = -1;
        }
    }

    public boolean isInFlight() {
        return inFlight != -1;
    }
}
