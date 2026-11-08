package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.Test;

public class ReloadGuardTest {

    @Test
    public void onlyOneReloadRunsAtATime() {
        ReloadGuard guard = new ReloadGuard();
        long first = guard.tryBegin();
        assertTrue(first > 0);
        assertEquals(-1, guard.tryBegin());
        assertTrue(guard.isInFlight());
        guard.finish(first);
        assertFalse(guard.isInFlight());
        long second = guard.tryBegin();
        assertTrue(second > first);
        guard.finish(second);
    }

    @Test
    public void aStaleGenerationIsNotCurrent() {
        ReloadGuard guard = new ReloadGuard();
        long first = guard.tryBegin();
        guard.finish(first);
        long second = guard.tryBegin();
        assertFalse(guard.isCurrent(first));
        assertTrue(guard.isCurrent(second));
        guard.invalidate();
        assertFalse(guard.isCurrent(second));
        assertFalse(guard.isInFlight());
    }

    @Test
    public void invalidateStopsTheInFlightReloadFromCompleting() {
        ReloadGuard guard = new ReloadGuard();
        long stale = guard.tryBegin();
        guard.invalidate();
        assertFalse(guard.isCurrent(stale));
        // New work may start, and finishing the stale reload must not clear
        // the newer single-flight slot.
        long fresh = guard.tryBegin();
        assertTrue(fresh > stale);
        assertTrue(guard.isInFlight());
        guard.finish(stale);
        assertTrue(guard.isInFlight());
        guard.finish(fresh);
        assertFalse(guard.isInFlight());
    }

    @Test
    public void aStaleFinishDoesNotClearANewerReload() {
        ReloadGuard guard = new ReloadGuard();
        long first = guard.tryBegin();
        guard.finish(first);
        long second = guard.tryBegin();
        guard.finish(first); // late callback from the previous generation
        assertTrue(guard.isInFlight());
        assertTrue(guard.isCurrent(second));
        guard.finish(second);
        assertFalse(guard.isInFlight());
    }

    @Test
    public void concurrentBeginnersSeeExactlyOneWinner() throws Exception {
        ReloadGuard guard = new ReloadGuard();
        AtomicInteger winners = new AtomicInteger();
        CountDownLatch start = new CountDownLatch(1);
        Thread[] threads = new Thread[8];
        for (int i = 0; i < threads.length; i += 1) {
            threads[i] = new Thread(() -> {
                try {
                    start.await();
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                if (guard.tryBegin() > 0) {
                    winners.incrementAndGet();
                }
            });
            threads[i].start();
        }
        start.countDown();
        for (Thread thread : threads) {
            thread.join();
        }
        assertEquals(1, winners.get());
    }
}
