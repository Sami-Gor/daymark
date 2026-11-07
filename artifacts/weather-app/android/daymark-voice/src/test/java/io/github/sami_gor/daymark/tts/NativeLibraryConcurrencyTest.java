package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Test;

public class NativeLibraryConcurrencyTest {

    @After
    public void tearDown() {
        NativeLibraryState.resetForTest();
    }

    @Test
    public void concurrentCallsLoadExactlyOnce() throws Exception {
        final AtomicInteger loads = new AtomicInteger();
        NativeLibraryState.setLoaderForTest(name -> loads.incrementAndGet());
        final int threads = 8;
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(threads);
        final boolean[] results = new boolean[threads];
        for (int i = 0; i < threads; i++) {
            final int index = i;
            new Thread(() -> {
                try {
                    start.await();
                    results[index] = NativeLibraryState.ensureLoaded();
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            }).start();
        }
        start.countDown();
        done.await();
        assertEquals(1, loads.get());
        for (boolean result : results) {
            assertTrue(result);
        }
    }
}
