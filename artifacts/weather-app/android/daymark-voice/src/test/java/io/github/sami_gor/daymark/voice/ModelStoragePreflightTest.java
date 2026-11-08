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

    // ------------------------------------------------------------------
    // P0: the storage requirement is installed bytes + staging + margin.
    // ------------------------------------------------------------------

    @Test
    public void pinnedModelRequiresInstalledPlusStagingPlusMargin() {
        long[] sizes = ParakeetModelAssets.MODEL_FILE_SIZES;
        long installed = 0L;
        long staging = 0L;
        for (long size : sizes) {
            installed += size;
            staging = Math.max(staging, size);
        }
        long margin = Math.max(ModelStoragePreflight.MIN_MARGIN_BYTES,
                installed * ModelStoragePreflight.MARGIN_PERCENT / 100L);

        assertEquals("sum of the four pinned files",
                670_478_772L, installed);
        assertEquals("staging is one copy of the largest asset",
                652_184_281L, staging);
        assertEquals("3% of the model beats the 16 MiB floor",
                20_114_363L, margin);
        assertEquals("expected bytes the plugin logs before installing",
                1_342_777_416L, ModelStoragePreflight.requiredBytes(sizes));
        assertEquals(installed + staging + margin,
                ModelStoragePreflight.requiredBytes(sizes));
    }

    @Test
    public void theMarginConstantsAreTheDocumentedOnes() {
        assertEquals("16 MiB floor", 16L * 1024L * 1024L,
                ModelStoragePreflight.MIN_MARGIN_BYTES);
        assertEquals("3% margin", 3L, ModelStoragePreflight.MARGIN_PERCENT);

        // Small models are dominated by the floor ...
        assertEquals(2L + 1L + ModelStoragePreflight.MIN_MARGIN_BYTES,
                ModelStoragePreflight.requiredBytes(new long[] {1L, 1L}));
        // ... and large models by the percentage.
        long mib = 1024L * 1024L;
        long total = 1_000L * mib;
        assertEquals(total + total + (total * 3L / 100L),
                ModelStoragePreflight.requiredBytes(new long[] {total}));
    }

    @Test
    public void stagingIsTheLargestSingleFileNotTheWholeModel() {
        long mib = 1024L * 1024L;
        long total = 300L * mib;
        long staging = 200L * mib;
        long margin = Math.max(16L * mib, total * 3L / 100L);

        assertEquals(total + staging + margin,
                ModelStoragePreflight.requiredBytes(
                        new long[] {100L * mib, staging, 0L}));
        // The order of the files does not change the staging term.
        assertEquals(ModelStoragePreflight.requiredBytes(
                        new long[] {100L * mib, staging, 0L}),
                ModelStoragePreflight.requiredBytes(
                        new long[] {staging, 0L, 100L * mib}));
        assertTrue("not the sum of every file counted twice",
                ModelStoragePreflight.requiredBytes(new long[] {100L * mib, staging, 0L})
                        < total + total + margin);
    }

    @Test
    public void noFilesAndEmptyTablesRequireNoSpace() {
        assertEquals(0L, ModelStoragePreflight.requiredBytes(null));
        assertEquals(0L, ModelStoragePreflight.requiredBytes(new long[0]));
        assertTrue(ModelStoragePreflight.hasRoom(0L, new long[0]));
    }

    @Test(expected = IllegalArgumentException.class)
    public void negativeSizesAreRejected() {
        ModelStoragePreflight.requiredBytes(new long[] {1L, -1L});
    }
}
