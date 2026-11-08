package io.github.sami_gor.daymark.packs;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import java.security.KeyPair;

import org.junit.Test;

public class PackSignatureVerifierTest {

    private static final byte[] PAYLOAD = PackTestSupport.utf8("signed-french-voice");

    private static void assertReason(
            PackSignatureVerifier verifier, PackManifest manifest, byte[] signature,
            String expected) {
        try {
            verifier.verify(manifest, signature);
            fail("expected signature failure " + expected);
        } catch (PackSignatureVerifier.SignatureException e) {
            assertEquals(expected, e.reason);
        }
    }

    @Test
    public void verifiesDetachedSignatureOverCanonicalManifestBytes() throws Exception {
        KeyPair keyPair = PackTestSupport.ed25519KeyPair();
        PackManifest manifest = PackTestSupport.parseFrench(3, PAYLOAD);
        byte[] signature = PackTestSupport.sign(
                keyPair.getPrivate(), manifest.canonicalBytes());

        PackSignatureVerifier verifier = new PackSignatureVerifier(
                PackTestSupport.anchor(keyPair.getPublic()));
        verifier.verify(manifest, signature);
        verifier.verify(manifest.canonicalBytes(), signature);
    }

    @Test
    public void rejectsSignatureFromAnotherKey() throws Exception {
        KeyPair signer = PackTestSupport.ed25519KeyPair();
        KeyPair other = PackTestSupport.ed25519KeyPair();
        PackManifest manifest = PackTestSupport.parseFrench(3, PAYLOAD);
        byte[] signature = PackTestSupport.sign(signer.getPrivate(), manifest.canonicalBytes());

        PackSignatureVerifier verifier = new PackSignatureVerifier(
                PackTestSupport.anchor(other.getPublic()));
        assertReason(verifier, manifest, signature, "signature-mismatch");
    }

    @Test
    public void rejectsManifestChangedAfterSigning() throws Exception {
        KeyPair keyPair = PackTestSupport.ed25519KeyPair();
        PackManifest original = PackTestSupport.parseFrench(3, PAYLOAD);
        byte[] signature = PackTestSupport.sign(
                keyPair.getPrivate(), original.canonicalBytes());
        PackManifest updated = PackTestSupport.parseFrench(4, PAYLOAD);

        PackSignatureVerifier verifier = new PackSignatureVerifier(
                PackTestSupport.anchor(keyPair.getPublic()));
        assertReason(verifier, updated, signature, "signature-mismatch");
    }

    @Test
    public void rejectsRawPrettyPrintedBytesInsteadOfCanonicalBytes() throws Exception {
        KeyPair keyPair = PackTestSupport.ed25519KeyPair();
        PackManifest manifest = PackTestSupport.parseFrench(3, PAYLOAD);
        byte[] pretty = PackTestSupport.utf8(
                PackTestSupport.frenchManifestJson(3, PAYLOAD, 21000)
                        .replace(",", ",\n  "));
        byte[] signature = PackTestSupport.sign(keyPair.getPrivate(), pretty);

        PackSignatureVerifier verifier = new PackSignatureVerifier(
                PackTestSupport.anchor(keyPair.getPublic()));
        assertReason(verifier, manifest, signature, "signature-mismatch");
    }

    @Test
    public void rejectsMissingAndMalformedSignatures() throws Exception {
        KeyPair keyPair = PackTestSupport.ed25519KeyPair();
        PackManifest manifest = PackTestSupport.parseFrench(3, PAYLOAD);
        PackSignatureVerifier verifier = new PackSignatureVerifier(
                PackTestSupport.anchor(keyPair.getPublic()));

        assertReason(verifier, manifest, null, "missing-signature");
        assertReason(verifier, manifest, new byte[63], "malformed-signature");
        assertReason(verifier, manifest, new byte[65], "malformed-signature");
    }

    @Test
    public void trustAnchorValidatesEncodingAndLength() throws Exception {
        KeyPair keyPair = PackTestSupport.ed25519KeyPair();
        byte[] encoded = keyPair.getPublic().getEncoded();
        assertEquals(44, encoded.length);
        PackTrustAnchor anchor = PackTrustAnchor.fromX509(encoded);
        assertArrayEquals(
                java.util.Arrays.copyOfRange(encoded, 12, 44), anchor.rawPublicKey());

        try {
            PackTrustAnchor.fromX509(new byte[43]);
            fail("expected short X.509 rejection");
        } catch (IllegalArgumentException expected) {
            // expected
        }
        byte[] wrongPrefix = encoded.clone();
        wrongPrefix[0] = 0x31;
        try {
            PackTrustAnchor.fromX509(wrongPrefix);
            fail("expected prefix rejection");
        } catch (IllegalArgumentException expected) {
            // expected
        }
        try {
            new PackTrustAnchor(new byte[32]);
            fail("expected zero-key rejection");
        } catch (IllegalArgumentException expected) {
            // expected
        }
    }
}
