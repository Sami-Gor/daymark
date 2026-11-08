package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import io.github.sami_gor.daymark.tts.NativeLibraryState;

import org.junit.After;
import org.junit.Test;

/**
 * P0 reliability contract as compiled into the shipping release variant.
 *
 * <p>The debug JVM suite exercises the same logic, but the release artifact is
 * what ships: its storage requirement must cover the pinned model plus one
 * staging copy plus the margin, and a missing Kokoro library must resolve to
 * {@code native-unavailable} in release too, without an
 * {@link UnsatisfiedLinkError} escaping.
 */
public class ReleaseReliabilityContractTest {

    @After
    public void tearDown() {
        NativeLibraryState.resetForTest();
    }

    @Test
    public void releaseStorageRequirementIsInstalledPlusStagingPlusMargin() {
        long[] sizes = ParakeetModelAssets.MODEL_FILE_SIZES;
        long installed = 0L;
        long staging = 0L;
        for (long size : sizes) {
            installed += size;
            staging = Math.max(staging, size);
        }
        long margin = Math.max(ModelStoragePreflight.MIN_MARGIN_BYTES,
                installed * ModelStoragePreflight.MARGIN_PERCENT / 100L);

        assertEquals(670_478_772L, installed);
        assertEquals(652_184_281L, staging);
        assertEquals(20_114_363L, margin);
        assertEquals(1_342_777_416L, ModelStoragePreflight.requiredBytes(sizes));
        assertEquals(installed + staging + margin,
                ModelStoragePreflight.requiredBytes(sizes));

        assertFalse("the installed bytes alone must not pass the check",
                ModelStoragePreflight.hasRoom(installed, sizes));
        assertFalse("one byte short must be refused",
                ModelStoragePreflight.hasRoom(
                        ModelStoragePreflight.requiredBytes(sizes) - 1L, sizes));
        assertTrue(ModelStoragePreflight.hasRoom(
                ModelStoragePreflight.requiredBytes(sizes), sizes));
    }

    @Test
    public void releaseReportsAMissingKokoroLibraryAsNativeUnavailableWithoutThrowing() {
        NativeLibraryState.setLoaderForTest(name -> {
            throw new UnsatisfiedLinkError(
                    "dlopen failed: library \"lib" + name + ".so\" not found");
        });

        final boolean loaded;
        try {
            loaded = NativeLibraryState.ensureLoaded();
        } catch (UnsatisfiedLinkError escaped) {
            fail("a missing library must not escape in the release build: "
                    + escaped.getMessage());
            return;
        }

        assertFalse(loaded);
        assertEquals("native-unavailable", NativeLibraryState.failureReason());
        assertEquals("native-unavailable",
                DaymarkVoicePlugin.classifyFailure(NativeLibraryState.failureReason()));
    }
}
