package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import io.github.sami_gor.daymark.tts.NativeLibraryState;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/**
 * P0 reliability proof: the optional Kokoro JNI library is missing.
 *
 * <p>The failure that used to crash the process was an {@link UnsatisfiedLinkError}
 * escaping a static initialiser while the Capacitor bridge was being built. The
 * fix is that loading is an operation with a recorded outcome
 * ({@link NativeLibraryState}) and the plugin reports {@code native-unavailable}
 * instead of throwing.
 *
 * <p>These tests cover every part of that path that exists on a plain JVM:
 * the loader throws exactly what {@code System.loadLibrary} throws when the
 * {@code .so} is absent, the failure is reported without escaping, it is sticky,
 * the plugin class initialises without touching native code, and the plugin's
 * classifier maps the recorded reason to {@code native-unavailable} rather than
 * {@code model-init-failed}. What cannot be covered here is
 * {@code DaymarkVoicePlugin.load()} itself: constructing the plugin requires a
 * live Capacitor bridge, an Android {@code Context} and a {@code Looper}, so the
 * on-device "voice unavailable, weather still works" check still needs a device.
 */
public class KokoroNativeLibraryAbsenceTest {

    private static final String LIBRARY_NAME = "kokoro_jni";
    private static final String LINKAGE_ERROR =
            "dlopen failed: library \"libkokoro_jni.so\" not found: needed by "
                    + "/data/app/~~hash==/io.github.sami_gor.daymark/base.apk!/lib/arm64-v8a";

    @Before
    public void setUp() {
        NativeLibraryState.resetForTest();
    }

    @After
    public void tearDown() {
        NativeLibraryState.resetForTest();
    }

    @Test
    public void missingLibraryIsReportedAsNativeUnavailableWithoutThrowing() {
        final int[] loadAttempts = {0};
        NativeLibraryState.setLoaderForTest(name -> {
            assertEquals("the plugin must load the packaged library by name",
                    LIBRARY_NAME, name);
            loadAttempts[0]++;
            throw new UnsatisfiedLinkError(LINKAGE_ERROR);
        });

        final boolean loaded;
        try {
            loaded = NativeLibraryState.ensureLoaded();
        } catch (UnsatisfiedLinkError escaped) {
            fail("a missing Kokoro library must not escape as UnsatisfiedLinkError: "
                    + escaped.getMessage());
            return;
        }

        assertFalse(loaded);
        assertEquals(1, loadAttempts[0]);
        assertFalse(NativeLibraryState.isLoaded());
        assertEquals("native-unavailable", NativeLibraryState.failureReason());
        assertEquals("the bridge must expose the same stable code to the web layer",
                "native-unavailable",
                DaymarkVoicePlugin.classifyFailure(NativeLibraryState.failureReason()));
    }

    @Test
    public void absenceIsStickyAndNeverRetriesIntoACrashLoop() {
        final int[] loadAttempts = {0};
        NativeLibraryState.setLoaderForTest(name -> {
            loadAttempts[0]++;
            throw new UnsatisfiedLinkError(LINKAGE_ERROR);
        });

        for (int attempt = 0; attempt < 3; attempt++) {
            final boolean loaded;
            try {
                loaded = NativeLibraryState.ensureLoaded();
            } catch (UnsatisfiedLinkError escaped) {
                fail("attempt " + attempt + " let UnsatisfiedLinkError escape");
                return;
            }
            assertFalse("attempt " + attempt + " must not claim availability", loaded);
            assertEquals("native-unavailable", NativeLibraryState.failureReason());
        }

        assertEquals("a missing library does not appear later in the same process",
                1, loadAttempts[0]);
    }

    @Test
    public void absenceSurvivesConcurrentGuardsWithoutEscaping() throws Exception {
        NativeLibraryState.setLoaderForTest(name -> {
            throw new UnsatisfiedLinkError(LINKAGE_ERROR);
        });

        final int threads = 4;
        final boolean[] results = new boolean[threads];
        final Throwable[] escaped = new Throwable[threads];
        final Thread[] workers = new Thread[threads];
        for (int index = 0; index < threads; index++) {
            final int slot = index;
            workers[index] = new Thread(() -> {
                try {
                    results[slot] = NativeLibraryState.ensureLoaded();
                } catch (Throwable failure) {
                    escaped[slot] = failure;
                }
            });
            workers[index].start();
        }
        for (Thread worker : workers) {
            worker.join();
        }

        for (int index = 0; index < threads; index++) {
            assertNull("thread " + index + " let " + escaped[index] + " escape",
                    escaped[index]);
            assertFalse(results[index]);
        }
        assertEquals("native-unavailable", NativeLibraryState.failureReason());
    }

    @Test
    public void pluginClassInitialisesWithoutLoadingNativeCode() {
        final Class<?> plugin;
        try {
            plugin = Class.forName(
                    "io.github.sami_gor.daymark.voice.DaymarkVoicePlugin",
                    true,
                    getClass().getClassLoader());
        } catch (UnsatisfiedLinkError escaped) {
            fail("initialising the plugin class must not load native code: "
                    + escaped.getMessage());
            return;
        } catch (ClassNotFoundException missing) {
            fail("the plugin class must be on the unit-test classpath: " + missing.getMessage());
            return;
        }

        assertNotNull(plugin);
        assertFalse("class initialisation must not report the native library as loaded",
                NativeLibraryState.isLoaded());
        assertNull("class initialisation must not record a failure",
                NativeLibraryState.failureReason());
    }

    @Test
    public void pluginDoesNotReportAMissingLibraryAsAModelInitFailure() {
        // Exactly what load() stores and logs on the absent-library branch:
        // lastFailureReason = reason == null ? "native-unavailable" : reason.
        assertEquals("native-unavailable",
                DaymarkVoicePlugin.classifyFailure(
                        "load: native library unavailable: native-unavailable"));
        assertEquals("native-unavailable",
                DaymarkVoicePlugin.classifyFailure(
                        "load: voice engine unavailable: native-unavailable"));
        // A library blocked by the platform also degrades to unavailable, not
        // to a model failure: the model was never the problem.
        assertEquals("native-unavailable", DaymarkVoicePlugin.classifyFailure("native-blocked"));
        assertNotEquals("model-init-failed",
                DaymarkVoicePlugin.classifyFailure("load: native library unavailable: native-unavailable"));
        assertNotEquals("model-init-failed", DaymarkVoicePlugin.classifyFailure("native-blocked"));
    }

    @Test
    public void blockedLibraryHasItsOwnReasonButTheSamePublicCode() {
        NativeLibraryState.setLoaderForTest(name -> {
            throw new SecurityException("library loading blocked by the platform");
        });

        final boolean loaded;
        try {
            loaded = NativeLibraryState.ensureLoaded();
        } catch (Throwable escaped) {
            fail("a blocked library must not escape: " + escaped);
            return;
        }

        assertFalse(loaded);
        assertEquals("native-blocked", NativeLibraryState.failureReason());
        assertEquals("native-unavailable",
                DaymarkVoicePlugin.classifyFailure(NativeLibraryState.failureReason()));
        assertTrue(NativeLibraryState.REASON_NATIVE_UNAVAILABLE.equals("native-unavailable"));
    }
}
