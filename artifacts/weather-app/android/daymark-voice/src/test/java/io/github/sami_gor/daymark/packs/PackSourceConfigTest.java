package io.github.sami_gor.daymark.packs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

/**
 * Configuration boundary for optional pack downloads.
 *
 * <p>These tests pin the fail-closed contract: an empty production
 * configuration throws, only HTTPS hosts without credentials/query/fragment are
 * accepted, the trust anchor is a public key (never a private key), and only
 * explicitly allowed optional voices can produce URLs.
 */
public class PackSourceConfigTest {

    private static final String BASE = "https://packs.example.daymark/v21";
    private static final String ANCHOR =
            "2913931e905640452ad0498185e5bd928c1ca6444908094e872a2f9d24605102";

    private static PackSourceConfig config(String base, String anchor, String voices)
            throws PackSourceConfig.ConfigurationException {
        return PackSourceConfig.fromBuildConfig(base, anchor, voices);
    }

    private static PackSourceConfig french() throws Exception {
        return config(BASE, ANCHOR, "ff_siwis");
    }

    private static void assertReason(String reason, String base, String anchor, String voices) {
        try {
            config(base, anchor, voices);
            fail("expected configuration to be rejected with " + reason);
        } catch (PackSourceConfig.ConfigurationException expected) {
            assertEquals(reason, expected.reason);
        }
    }

    @Test
    public void derivesEveryUrlFromTheConfiguredBase() throws Exception {
        PackSourceConfig source = french();
        assertEquals(BASE + "/fr/manifest.json", source.manifestUrl("ff_siwis"));
        assertEquals(BASE + "/fr/manifest.json.sig", source.signatureUrl("ff_siwis"));
        assertEquals(BASE + "/fr/ff_siwis.bin", source.payloadUrl("ff_siwis"));
        assertTrue(source.allows("ff_siwis"));
        assertFalse(source.allows("en"));
        assertFalse(source.allows("em_alex"));
        assertEquals(1, source.voices().size());
        assertEquals(PackSourceConfig.KNOWN_PAYLOAD_BYTES,
                source.requireVoice("ff_siwis").sizeBytes());
    }

    @Test
    public void emptyConfigurationFailsClosed() {
        assertReason(PackSourceConfig.UNCONFIGURED, "", ANCHOR, "ff_siwis");
        assertReason(PackSourceConfig.UNCONFIGURED, BASE, "", "ff_siwis");
        assertReason(PackSourceConfig.UNCONFIGURED, BASE, ANCHOR, "");
        assertReason(PackSourceConfig.UNCONFIGURED, null, null, null);
        assertReason(PackSourceConfig.UNCONFIGURED, "   ", "   ", "   ");
        assertReason(PackSourceConfig.UNCONFIGURED, BASE, ANCHOR, " , ");
    }

    @Test
    public void rejectsNonHttpsAndCredentialedBases() {
        assertReason("insecure-pack-source", "http://packs.example.daymark", ANCHOR, "ff_siwis");
        assertReason("insecure-pack-source", "ftp://packs.example.daymark", ANCHOR, "ff_siwis");
        assertReason("credentials-in-pack-source",
                "https://user:secret@packs.example.daymark", ANCHOR, "ff_siwis");
        assertReason("invalid-pack-source",
                "https://packs.example.daymark?token=1", ANCHOR, "ff_siwis");
        assertReason("invalid-pack-source",
                "https://packs.example.daymark#fragment", ANCHOR, "ff_siwis");
        assertReason("invalid-pack-source", "not a url", ANCHOR, "ff_siwis");
    }

    @Test
    public void rejectsTraversalAndAmbiguousBasePaths() {
        assertReason("invalid-pack-source", "https://packs.example.daymark/../pack", ANCHOR,
                "ff_siwis");
        assertReason("invalid-pack-source", "https://packs.example.daymark/./pack", ANCHOR,
                "ff_siwis");
        assertReason("invalid-pack-source", "https://packs.example.daymark//pack", ANCHOR,
                "ff_siwis");
        assertReason("invalid-pack-source", "https://packs.example.daymark/%2e%2e/pack", ANCHOR,
                "ff_siwis");
    }

    @Test
    public void acceptsAnHttpsBaseWithAPathAndTrailingSlash() throws Exception {
        PackSourceConfig source = config(
                "HTTPS://packs.example.daymark/v21/", ANCHOR, "ff_siwis");
        assertEquals("https://packs.example.daymark/v21/fr/manifest.json",
                source.manifestUrl("ff_siwis"));
    }

    @Test
    public void trustAnchorMustBeAPublicEd25519Key() {
        assertReason(PackSourceConfig.UNCONFIGURED, BASE, "", "ff_siwis");
        assertReason("invalid-pack-anchor", BASE, "abc", "ff_siwis");
        assertReason("invalid-pack-anchor", BASE, ANCHOR.substring(0, 63), "ff_siwis");
        assertReason("invalid-pack-anchor", BASE, ANCHOR + "00", "ff_siwis");
        assertReason("invalid-pack-anchor", BASE, "z".repeat(64), "ff_siwis");
        // A 32-byte all-zero value is not a usable Ed25519 public key.
        assertReason("invalid-pack-anchor", BASE, "0".repeat(64), "ff_siwis");
        // 128 hex characters would look like a key pair; only the public half is
        // ever accepted.
        assertReason("invalid-pack-anchor", BASE, ANCHOR + ANCHOR, "ff_siwis");
    }

    @Test
    public void onlyKnownOptionalVoicesCanBeConfigured() {
        assertReason("invalid-pack-voice", BASE, ANCHOR, "en");
        assertReason("invalid-pack-voice", BASE, ANCHOR, "de");
        assertReason("invalid-pack-voice", BASE, ANCHOR, "FF_SIWIS");
        assertReason("invalid-pack-voice", BASE, ANCHOR, "../ff_siwis");
        assertReason("invalid-pack-voice", BASE, ANCHOR, "ff_siwis,ff_siwis");
        assertReason("invalid-pack-voice", BASE, ANCHOR, "ff_siwis,/etc/passwd");
    }

    @Test
    public void unsupportedVoiceCannotProduceAUrl() throws Exception {
        PackSourceConfig source = french();
        List<String> refused = new ArrayList<>();
        for (String voice : new String[]{"em_alex", "bm_fable", "en", "", null}) {
            try {
                source.manifestUrl(voice);
                fail("unsupported voice produced a URL: " + voice);
            } catch (IllegalArgumentException expected) {
                refused.add(String.valueOf(voice));
            }
        }
        assertEquals(5, refused.size());
    }

    @Test
    public void multipleAllowedVoicesStayScopedToTheirOwnPack() throws Exception {
        PackSourceConfig source = config(BASE, ANCHOR, "ff_siwis, em_alex");
        assertEquals(BASE + "/fr/ff_siwis.bin", source.payloadUrl("ff_siwis"));
        assertEquals(BASE + "/es/em_alex.bin", source.payloadUrl("em_alex"));
        assertEquals(BASE + "/es/manifest.json", source.manifestUrl("em_alex"));
        assertEquals(2, source.voices().size());
    }
}
