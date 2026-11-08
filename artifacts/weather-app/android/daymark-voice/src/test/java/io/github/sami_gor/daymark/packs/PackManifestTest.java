package io.github.sami_gor.daymark.packs;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.util.Arrays;

import org.junit.Test;

public class PackManifestTest {

    private static final byte[] PAYLOAD = PackTestSupport.utf8("french-voice-bytes");

    private static String valid() {
        return PackTestSupport.frenchManifestJson(7, PAYLOAD, 21000);
    }

    private void assertReason(String json, String expected) {
        try {
            PackManifest.parse(json);
            fail("expected manifest failure " + expected);
        } catch (PackManifest.ManifestException e) {
            assertEquals(expected, e.reason);
        }
    }

    @Test
    public void parsesAndExposesEveryField() throws Exception {
        PackManifest manifest = PackManifest.parse(valid());
        assertEquals(1, manifest.schemaVersion());
        assertEquals("fr", manifest.packId());
        assertEquals(7, manifest.version());
        assertEquals("ff_siwis", manifest.voiceId());
        assertEquals(21000, manifest.minAppVersion());
        assertEquals(PAYLOAD.length, manifest.file().size());
        assertEquals(PackTestSupport.sha256(PAYLOAD), manifest.file().sha256());
        assertEquals(PackLicences.FRENCH_LICENCE_SPDX, manifest.licence().spdx());
        assertEquals(PackLicences.RIGHTS_CLEARED, manifest.licence().rights());
        assertTrue(manifest.licence().isDistributable());
        assertTrue(manifest.licence().notice().contains("10.7488/ds/1705"));
    }

    @Test
    public void canonicalBytesIgnoreFormattingButNotContent() throws Exception {
        String spaced = valid().replace(
                "{\"schemaVersion\":1,\"packId\"",
                "{ \"schemaVersion\" : 1 , \"packId\"");
        PackManifest first = PackManifest.parse(valid());
        PackManifest second = PackManifest.parse(spaced);
        assertArrayEquals(first.canonicalBytes(), second.canonicalBytes());

        PackManifest changed = PackManifest.parse(
                PackTestSupport.frenchManifestJson(8, PAYLOAD, 21000));
        assertFalse(Arrays.equals(first.canonicalBytes(), changed.canonicalBytes()));
    }

    @Test
    public void normalisesUppercaseDigest() throws Exception {
        String uppercase = valid().replace(
                PackTestSupport.sha256(PAYLOAD),
                PackTestSupport.sha256(PAYLOAD).toUpperCase());
        PackManifest manifest = PackManifest.parse(uppercase);
        assertEquals(PackTestSupport.sha256(PAYLOAD), manifest.file().sha256());
        assertArrayEquals(PackManifest.parse(valid()).canonicalBytes(), manifest.canonicalBytes());
    }

    @Test
    public void rejectsDuplicateAndUnknownFields() {
        assertReason(valid().replace("\"version\":7", "\"version\":7,\"version\":7"),
                "duplicate-field");
        assertReason(valid().replace("}", ",\"surprise\":1}"), "unknown-field");
        assertReason(
                valid().replace("\"licence\":{", "\"licence\":{\"surprise\":1,"),
                "unknown-field");
    }

    @Test
    public void rejectsMissingAndWronglyTypedFields() {
        assertReason(valid().replace("\"minAppVersion\":21000,", ""), "missing-field");
        assertReason(valid().replace("\"version\":7", "\"version\":\"7\""), "invalid-field");
        assertReason(valid().replace("\"version\":7", "\"version\":7.5"), "invalid-json");
        assertReason(valid().replace("\"schemaVersion\":1", "\"schemaVersion\":2"),
                "invalid-schema");
    }

    @Test
    public void rejectsBadPackAndVoiceCombinations() {
        assertReason(PackTestSupport.manifestJson(
                "en", 1, "bm_fable", 21000, PackTestSupport.frenchLicence(),
                PackTestSupport.filesJson("bm_fable.bin", PAYLOAD)), "invalid-pack");
        assertReason(PackTestSupport.manifestJson(
                "de", 1, "ff_siwis", 21000, PackTestSupport.frenchLicence(),
                PackTestSupport.filesJson("ff_siwis.bin", PAYLOAD)), "unsupported-pack");
        assertReason(PackTestSupport.manifestJson(
                "fr", 1, "em_alex", 21000, PackTestSupport.frenchLicence(),
                PackTestSupport.filesJson("em_alex.bin", PAYLOAD)), "voice-pack-mismatch");
    }

    @Test
    public void rejectsNonPositiveVersionAndMinimumApp() {
        assertReason(valid().replace("\"version\":7", "\"version\":0"), "invalid-version");
        assertReason(valid().replace("\"minAppVersion\":21000", "\"minAppVersion\":0"),
                "invalid-version");
    }

    @Test
    public void rejectsUnsafeOrMismatchedPayloadPaths() {
        String traversal = PackTestSupport.manifestJson(
                "fr", 1, "ff_siwis", 21000, PackTestSupport.frenchLicence(),
                "[{\"path\":\"../ff_siwis.bin\",\"size\":" + PAYLOAD.length
                        + ",\"sha256\":\"" + PackTestSupport.sha256(PAYLOAD) + "\"}]");
        assertReason(traversal, "invalid-file-path");

        String wrongName = PackTestSupport.manifestJson(
                "fr", 1, "ff_siwis", 21000, PackTestSupport.frenchLicence(),
                "[{\"path\":\"other.bin\",\"size\":" + PAYLOAD.length
                        + ",\"sha256\":\"" + PackTestSupport.sha256(PAYLOAD) + "\"}]");
        assertReason(wrongName, "invalid-file-path");
    }

    @Test
    public void rejectsBadSizesHashesAndFileCounts() {
        assertReason(valid().replace("\"size\":" + PAYLOAD.length, "\"size\":0"),
                "invalid-size");
        assertReason(valid().replace(PackTestSupport.sha256(PAYLOAD), "abcd"), "invalid-hash");
        String oneFile = PackTestSupport.filesJson("ff_siwis.bin", PAYLOAD);
        assertReason(PackTestSupport.manifestJson(
                "fr", 1, "ff_siwis", 21000, PackTestSupport.frenchLicence(),
                "[" + oneFile.substring(1, oneFile.length() - 1) + ","
                        + oneFile.substring(1, oneFile.length() - 1) + "]"), "invalid-file");
    }

    @Test
    public void requiresAnExplicitRightsFlag() {
        String noRights = PackTestSupport.licence(
                PackLicences.FRENCH_LICENCE_SPDX,
                PackLicences.FRENCH_LICENCE_NAME,
                PackLicences.FRENCH_LICENCE_URL,
                PackLicences.FRENCH_ATTRIBUTION,
                PackLicences.FRENCH_NOTICE,
                null,
                false);
        assertReason(PackTestSupport.manifestJson(
                "fr", 1, "ff_siwis", 21000, noRights,
                PackTestSupport.filesJson("ff_siwis.bin", PAYLOAD)), "missing-rights");

        String unknown = PackTestSupport.licence(
                PackLicences.FRENCH_LICENCE_SPDX,
                PackLicences.FRENCH_LICENCE_NAME,
                PackLicences.FRENCH_LICENCE_URL,
                PackLicences.FRENCH_ATTRIBUTION,
                PackLicences.FRENCH_NOTICE,
                "probably-fine",
                false);
        assertReason(PackTestSupport.manifestJson(
                "fr", 1, "ff_siwis", 21000, unknown,
                PackTestSupport.filesJson("ff_siwis.bin", PAYLOAD)), "invalid-rights");
    }

    @Test
    public void unresolvedRightsMustBeDevelopmentOnly() {
        String unresolvedRelease = PackTestSupport.licence(
                PackLicences.SPANISH_LICENCE_SPDX,
                PackLicences.SPANISH_LICENCE_NAME,
                PackLicences.SPANISH_LICENCE_URL,
                PackLicences.SPANISH_ATTRIBUTION,
                PackLicences.SPANISH_NOTICE,
                PackLicences.RIGHTS_UNRESOLVED,
                false);
        assertReason(PackTestSupport.manifestJson(
                "es", 1, "em_alex", 21000, unresolvedRelease,
                PackTestSupport.filesJson("em_alex.bin", PAYLOAD)),
                "development-only-required");
    }

    @Test
    public void spanishDevelopmentOnlyPackIsNeverDistributable() throws Exception {
        PackManifest manifest = PackManifest.parse(PackTestSupport.spanishManifestJson(
                1, PAYLOAD, 21000));
        assertEquals("es", manifest.packId());
        assertEquals("em_alex", manifest.voiceId());
        assertEquals(PackLicences.RIGHTS_UNRESOLVED, manifest.licence().rights());
        assertTrue(manifest.licence().developmentOnly());
        assertFalse(manifest.licence().isDistributable());
        assertTrue(manifest.licence().notice().contains("Apache License"));
    }

    @Test
    public void frenchLicenceMustCarryCcByAndSiuisDoi() {
        String noDoi = valid().replace("10.7488/ds/1705", "10.7488/ds/0000");
        assertReason(noDoi, "invalid-licence");
        String wrongSpdx = valid().replace(
                "\"spdx\":\"" + PackLicences.FRENCH_LICENCE_SPDX + "\"",
                "\"spdx\":\"MIT\"");
        assertReason(wrongSpdx, "invalid-licence");
    }

    @Test
    public void spanishLicenceMustCarryApacheText() {
        String noApache = PackTestSupport.manifestJson(
                "es", 1, "em_alex", 21000,
                PackTestSupport.licence(
                        PackLicences.SPANISH_LICENCE_SPDX,
                        PackLicences.SPANISH_LICENCE_NAME,
                        PackLicences.SPANISH_LICENCE_URL,
                        "Kokoro Spanish voice",
                        "Kokoro Spanish voice, redistributed by Daymark.",
                        PackLicences.RIGHTS_UNRESOLVED,
                        true),
                PackTestSupport.filesJson("em_alex.bin", PAYLOAD));
        assertReason(noApache, "invalid-licence");
    }

    @Test
    public void rejectsNonHttpsLicenceUrl() {
        String insecure = valid().replace(
                PackLicences.FRENCH_LICENCE_URL, "http://creativecommons.org/licenses/by/4.0/");
        assertReason(insecure, "invalid-licence");
    }

    @Test
    public void rejectsTrailingContentAndBom() {
        assertReason(valid() + "{}", "invalid-json");
        byte[] bom = PackTestSupport.concat(
                new byte[] {(byte) 0xef, (byte) 0xbb, (byte) 0xbf},
                PackTestSupport.utf8(valid()));
        try {
            PackManifest.parse(bom);
            fail("expected BOM rejection");
        } catch (PackManifest.ManifestException e) {
            assertEquals("invalid-json", e.reason);
        }
    }
}
