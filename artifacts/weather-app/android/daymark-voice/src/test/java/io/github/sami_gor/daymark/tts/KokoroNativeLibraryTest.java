package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;

import org.junit.Test;

/**
 * Guards the missing-libkokoro_jni degradation path.
 *
 * The JVM unit-test environment never has libkokoro_jni.so on its library
 * path (the library is a gitignored, arm64-v8a-only Android build artifact),
 * so merely touching {@link KokoroNativeLibrary} here exercises exactly the
 * absence path that the x86_64 emulator build of the API 30 location smoke
 * workflow hits on device: the class must initialize, and it must report
 * unavailability with a reason, instead of throwing
 * {@link UnsatisfiedLinkError} out of the static initializer and crashing
 * the app during plugin load.
 *
 * The ERROR-state transitions in KokoroLocalTtsEngine.initialize and the
 * null-engine fallback in DaymarkVoicePlugin are deliberately not asserted
 * here: they run through android.os.Handler/Looper/Log, which the plain JVM
 * unit-test source set does not stub, and the behavioural guarantee that
 * matters (the load never throws; availability is a query) is fully covered
 * by this test.
 */
public class KokoroNativeLibraryTest {

    @Test
    public void missingNativeLibraryReportsUnavailableInsteadOfThrowing() {
        // Class initialization itself is the assertion: before the guarded
        // loader this line failed with ExceptionInInitializerError caused by
        // UnsatisfiedLinkError on any build without the library.
        assertFalse(KokoroNativeLibrary.isAvailable());
        assertNotNull(KokoroNativeLibrary.loadFailure());
    }
}
