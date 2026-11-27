package io.github.sami_gor.daymark.tts;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Monotonic token for one narration session.
 *
 * <p>Every start supersedes the previous token, and stop invalidates the
 * current token. A worker that was already synthesising can finish its native
 * call, but it must not publish a completion, create a new AudioTrack, or
 * overwrite the state of the newer session.
 */
final class PlaybackGeneration {

    private final AtomicInteger value = new AtomicInteger();

    int begin() {
        return value.incrementAndGet();
    }

    void invalidate() {
        value.incrementAndGet();
    }

    boolean isCurrent(int token) {
        return value.get() == token;
    }
}
