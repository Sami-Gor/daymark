package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class NativeLibraryStateTest {

    @Before
    public void setUp() {
        NativeLibraryState.resetForTest();
    }

    @After
    public void tearDown() {
        NativeLibraryState.resetForTest();
    }

    @Test
    public void loadsOnceAndStaysLoaded() {
        final int[] calls = {0};
        NativeLibraryState.setLoaderForTest(name -> calls[0]++);
        assertTrue(NativeLibraryState.ensureLoaded());
        assertTrue(NativeLibraryState.ensureLoaded());
        assertEquals(1, calls[0]);
        assertTrue(NativeLibraryState.isLoaded());
        assertNull(NativeLibraryState.failureReason());
    }

    @Test
    public void missingLibraryIsReportedAndSticky() {
        final int[] calls = {0};
        NativeLibraryState.setLoaderForTest(name -> {
            calls[0]++;
            throw new UnsatisfiedLinkError("library \"kokoro_jni\" not found");
        });
        assertFalse(NativeLibraryState.ensureLoaded());
        assertFalse(NativeLibraryState.ensureLoaded());
        assertEquals(1, calls[0]); // never retries into a crash loop
        assertFalse(NativeLibraryState.isLoaded());
        assertEquals(NativeLibraryState.REASON_NATIVE_UNAVAILABLE,
                NativeLibraryState.failureReason());
    }

    @Test
    public void blockedLibraryHasItsOwnReason() {
        NativeLibraryState.setLoaderForTest(name -> {
            throw new SecurityException("not allowed");
        });
        assertFalse(NativeLibraryState.ensureLoaded());
        assertEquals(NativeLibraryState.REASON_NATIVE_BLOCKED,
                NativeLibraryState.failureReason());
    }
}
