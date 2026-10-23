package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.util.HashSet;
import java.util.Set;

import org.junit.Test;

/**
 * Guards the pinned Parakeet model table and the reason strings the web layer
 * switches on.
 *
 * <p>These are pure constants, but a mistake here is not recoverable at
 * runtime: a wrong digest rejects the real model, and a renamed reason stops
 * matching the JavaScript mapping. Synthetic and fast; the real 670 MB model is
 * never read.
 */
public class ParakeetModelAssetsTest {

    @Test
    public void keepsTheNameSizeAndDigestTablesAligned() {
        assertEquals(ParakeetModelAssets.MODEL_FILE_NAMES.length, ParakeetModelAssets.MODEL_FILE_SIZES.length);
        assertEquals(ParakeetModelAssets.MODEL_FILE_NAMES.length, ParakeetModelAssets.MODEL_FILE_SHA256.length);
        assertEquals(4, ParakeetModelAssets.MODEL_FILE_NAMES.length);
    }

    @Test
    public void usesUniqueNamesAndPositiveSizes() {
        Set<String> names = new HashSet<>();
        for (int index = 0; index < ParakeetModelAssets.MODEL_FILE_NAMES.length; index++) {
            String name = ParakeetModelAssets.MODEL_FILE_NAMES[index];
            assertNotNull(name);
            assertFalse(name.isEmpty());
            assertTrue("duplicate model file: " + name, names.add(name));
            assertTrue("size must be pinned: " + name, ParakeetModelAssets.MODEL_FILE_SIZES[index] > 0L);
        }
    }

    @Test
    public void pinsLowercaseSha256ForEveryFile() {
        for (String digest : ParakeetModelAssets.MODEL_FILE_SHA256) {
            assertNotNull(digest);
            assertTrue("not a lowercase SHA-256: " + digest, digest.matches("[0-9a-f]{64}"));
        }
    }

    @Test
    public void mapsAssetAndMaterialisedPaths() {
        assertEquals("parakeet/encoder.int8.onnx",
                ParakeetModelAssets.assetPath("encoder.int8.onnx"));
        assertEquals("parakeet-v3-model/encoder.int8.onnx",
                ParakeetModelAssets.fileName("encoder.int8.onnx"));
    }

    @Test
    public void recognisesOnlyPinnedModelFiles() {
        for (String name : ParakeetModelAssets.MODEL_FILE_NAMES) {
            assertTrue(name, ParakeetModelAssets.isModelFile(name));
        }
        assertFalse(ParakeetModelAssets.isModelFile("tokens.TXT"));
        assertFalse(ParakeetModelAssets.isModelFile("../tokens.txt"));
        assertFalse(ParakeetModelAssets.isModelFile("encoder.int8.onnx.part"));
        assertFalse(ParakeetModelAssets.isModelFile(null));
    }

    @Test
    public void exposesStableDistinctUnavailableReasons() {
        // These strings are matched by voice-input-native.ts and rendered by the
        // web layer; renaming one silently changes user-visible behaviour.
        assertEquals("model-missing", ParakeetModelAssets.REASON_MODEL_MISSING);
        assertEquals("model-preparing", ParakeetModelAssets.REASON_MODEL_PREPARING);
        assertEquals("model-corrupt", ParakeetModelAssets.REASON_MODEL_CORRUPT);
        assertEquals("runtime-unavailable", ParakeetModelAssets.REASON_RUNTIME_UNAVAILABLE);

        Set<String> reasons = new HashSet<>();
        reasons.add(ParakeetModelAssets.REASON_MODEL_MISSING);
        reasons.add(ParakeetModelAssets.REASON_MODEL_PREPARING);
        reasons.add(ParakeetModelAssets.REASON_MODEL_CORRUPT);
        reasons.add(ParakeetModelAssets.REASON_RUNTIME_UNAVAILABLE);
        assertEquals(4, reasons.size());
    }

    @Test
    public void modelVersionIdentifiesThePinnedContent() {
        assertNotNull(ParakeetModelAssets.MODEL_VERSION);
        assertFalse(ParakeetModelAssets.MODEL_VERSION.isEmpty());
        assertTrue(ParakeetModelAssets.MODEL_VERSION.contains("parakeet"));
    }
}
