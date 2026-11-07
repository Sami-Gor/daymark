package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ModelStoragePreflightTest {

    private static final long MiB = 1024L * 1024L;
    private static final long[] SIZES = {652L * MiB, 12L * MiB, 6L * MiB};

    @Test
    public void requiresInstalledBytesPlusOneTemporaryCopyAndMargin() {
        long total = 670L * MiB;
        long margin = Math.max(16L * MiB, total * 3L / 100L);
        assertEquals(total + 652L * MiB + margin, ModelStoragePreflight.requiredBytes(SIZES));
    }

    @Test
    public void refusesWhenOnlyTheInstalledSizeIsFree() {
        assertFalse(ModelStoragePreflight.hasRoom(700L * MiB, SIZES));
    }

    @Test
    public void acceptsWhenStagingAndMarginFit() {
        assertTrue(ModelStoragePreflight.hasRoom(
                ModelStoragePreflight.requiredBytes(SIZES), SIZES));
        assertFalse(ModelStoragePreflight.hasRoom(
                ModelStoragePreflight.requiredBytes(SIZES) - 1L, SIZES));
    }

    @Test
    public void classifiesCopyFailuresWithoutFlatteningThem() {
        assertEquals(ParakeetModelAssets.REASON_INSUFFICIENT_STORAGE,
                ParakeetModelInstaller.classify(
                        new java.io.IOException("write failed: No space left on device")));
        assertEquals(ParakeetModelAssets.REASON_INSUFFICIENT_STORAGE,
                ParakeetModelInstaller.classify(new java.io.IOException("ENOSPC")));
        assertEquals(ParakeetModelAssets.REASON_INSTALLATION_INTERRUPTED,
                ParakeetModelInstaller.classify(new InterruptedException("cancelled")));
        assertEquals(ParakeetModelAssets.REASON_STORAGE_WRITE_FAILED,
                ParakeetModelInstaller.classify(new java.io.IOException("permission denied")));
        assertEquals("custom", ParakeetModelInstaller.classify(
                new ParakeetModelInstaller.InstallException("custom")));
    }
}
