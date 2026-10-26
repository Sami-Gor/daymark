package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Plain JVM coverage for {@link ParakeetModelAssets}.
 *
 * <p>These constants and helpers are deliberately free of Android types so they
 * can be exercised without an emulator. They pin the contract the runtime and
 * the web layer rely on: the four model files, their asset paths, their
 * materialised file names, and the reason codes reported to the UI.
 */
public class ParakeetModelAssetsTest {

    @Test
    public void modelFileNamesAndSizesMatch() {
        assertEquals(ParakeetModelAssets.MODEL_FILE_NAMES.length,
                ParakeetModelAssets.MODEL_FILE_SIZES.length);
        assertEquals(ParakeetModelAssets.MODEL_FILE_NAMES.length,
                ParakeetModelAssets.MODEL_FILE_SHA256.length);
        assertTrue(ParakeetModelAssets.MODEL_FILE_NAMES.length > 0);
    }

    @Test
    public void pinsLowercaseSha256ForEveryFile() {
        for (String digest : ParakeetModelAssets.MODEL_FILE_SHA256) {
            assertNotNull(digest);
            assertTrue("not a lowercase SHA-256: " + digest, digest.matches("[0-9a-f]{64}"));
        }
    }

    @Test
    public void modelFileNamesAreTheFourExpected() {
        String[] expected = {"encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"};
        assertEquals(expected.length, ParakeetModelAssets.MODEL_FILE_NAMES.length);
        for (int i = 0; i < expected.length; i++) {
            assertEquals(expected[i], ParakeetModelAssets.MODEL_FILE_NAMES[i]);
        }
    }

    @Test
    public void modelFileSizesArePositive() {
        for (long size : ParakeetModelAssets.MODEL_FILE_SIZES) {
            assertTrue(size > 0L);
        }
    }

    @Test
    public void assetDirectoryAndModelDirectoryAreNonEmpty() {
        assertNotNull(ParakeetModelAssets.ASSET_DIRECTORY);
        assertFalse(ParakeetModelAssets.ASSET_DIRECTORY.isEmpty());
        assertNotNull(ParakeetModelAssets.MODEL_DIRECTORY);
        assertFalse(ParakeetModelAssets.MODEL_DIRECTORY.isEmpty());
    }

    @Test
    public void assetPathJoinsDirectoryAndName() {
        for (String name : ParakeetModelAssets.MODEL_FILE_NAMES) {
            assertEquals("parakeet/" + name, ParakeetModelAssets.assetPath(name));
        }
    }

    @Test
    public void fileNameJoinsModelDirectoryAndName() {
        for (String name : ParakeetModelAssets.MODEL_FILE_NAMES) {
            assertEquals("parakeet-v3-model/" + name, ParakeetModelAssets.fileName(name));
        }
    }

    @Test
    public void isModelFileRecognisesKnownNames() {
        for (String name : ParakeetModelAssets.MODEL_FILE_NAMES) {
            assertTrue(ParakeetModelAssets.isModelFile(name));
        }
    }

    @Test
    public void isModelFileRejectsUnknownNames() {
        assertFalse(ParakeetModelAssets.isModelFile(""));
        assertFalse(ParakeetModelAssets.isModelFile("encoder.onnx"));
        assertFalse(ParakeetModelAssets.isModelFile("tokens"));
        assertFalse(ParakeetModelAssets.isModelFile("UNKNOWN"));
    }

    @Test
    public void reasonCodesAreStable() {
        assertEquals("model-missing", ParakeetModelAssets.REASON_MODEL_MISSING);
        assertEquals("model-corrupt", ParakeetModelAssets.REASON_MODEL_CORRUPT);
        assertEquals("model-preparing", ParakeetModelAssets.REASON_MODEL_PREPARING);
        assertEquals("runtime-unavailable", ParakeetModelAssets.REASON_RUNTIME_UNAVAILABLE);
    }

    @Test
    public void reasonCodesAreDistinct() {
        java.util.Set<String> codes = new java.util.HashSet<>();
        codes.add(ParakeetModelAssets.REASON_MODEL_MISSING);
        codes.add(ParakeetModelAssets.REASON_MODEL_CORRUPT);
        codes.add(ParakeetModelAssets.REASON_MODEL_PREPARING);
        codes.add(ParakeetModelAssets.REASON_RUNTIME_UNAVAILABLE);
        assertEquals(4, codes.size());
    }

    @Test
    public void modelFileNamesAreUnique() {
        java.util.Set<String> names = new java.util.HashSet<>();
        for (String name : ParakeetModelAssets.MODEL_FILE_NAMES) {
            assertTrue(names.add(name));
        }
    }

    @Test
    public void modelFileSizesMatchPinnedValues() {
        long[] expected = {652184281L, 11845275L, 6355277L, 93939L};
        assertEquals(expected.length, ParakeetModelAssets.MODEL_FILE_SIZES.length);
        for (int i = 0; i < expected.length; i++) {
            assertEquals(expected[i], ParakeetModelAssets.MODEL_FILE_SIZES[i]);
        }
    }

    @Test
    public void isModelFileRejectsNullAndTraversal() {
        assertFalse(ParakeetModelAssets.isModelFile(null));
        assertFalse(ParakeetModelAssets.isModelFile("../tokens.txt"));
        assertFalse(ParakeetModelAssets.isModelFile("TOKENS.TXT"));
        assertFalse(ParakeetModelAssets.isModelFile("encoder.int8.onnx.bak"));
    }
}
