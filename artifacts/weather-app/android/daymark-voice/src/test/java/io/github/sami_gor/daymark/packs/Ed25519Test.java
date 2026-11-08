package io.github.sami_gor.daymark.packs;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.Signature;

import org.junit.Test;

public class Ed25519Test {

    private static byte[] hex(String value) {
        byte[] bytes = new byte[value.length() / 2];
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }

    @Test
    public void verifiesRfc8032TestVectorOne() {
        byte[] publicKey = hex(
                "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
        byte[] signature = hex(
                "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155"
                        + "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b");
        assertTrue(Ed25519.verify(publicKey, new byte[0], signature));
        assertFalse(Ed25519.verify(publicKey, new byte[] {1}, signature));
    }

    @Test
    public void agreesWithJdkForGeneratedKeys() throws Exception {
        for (int i = 0; i < 20; i++) {
            KeyPair keyPair = PackTestSupport.ed25519KeyPair();
            byte[] message = PackTestSupport.utf8("signed pack manifest " + i);
            Signature signer = Signature.getInstance("Ed25519");
            signer.initSign(keyPair.getPrivate());
            signer.update(message);
            byte[] signature = signer.sign();
            byte[] raw = PackTrustAnchor.fromX509(keyPair.getPublic().getEncoded())
                    .rawPublicKey();
            assertTrue("signature " + i, Ed25519.verify(raw, message, signature));

            byte[] tampered = message.clone();
            tampered[0] ^= 0x01;
            assertFalse(Ed25519.verify(raw, tampered, signature));
            signature[10] ^= 0x01;
            assertFalse(Ed25519.verify(raw, message, signature));
        }
    }

    @Test
    public void rejectsNonCanonicalAndSmallOrderPublicKeys() {
        assertFalse(Ed25519.isUsablePublicKey(null));
        assertFalse(Ed25519.isUsablePublicKey(new byte[31]));
        assertFalse(Ed25519.isUsablePublicKey(new byte[32]));
        // Identity point encoding (y=1, x=0) has small order.
        byte[] identity = new byte[32];
        identity[0] = 1;
        assertFalse(Ed25519.isUsablePublicKey(identity));
    }

    @Test
    public void rejectsScalarAtOrAboveGroupOrder() throws Exception {
        KeyPair keyPair = PackTestSupport.ed25519KeyPair();
        byte[] message = PackTestSupport.utf8("scalar check");
        byte[] signature = PackTestSupport.sign(keyPair.getPrivate(), message);
        byte[] raw = PackTrustAnchor.fromX509(keyPair.getPublic().getEncoded())
                .rawPublicKey();

        byte[] order = bigEndianToLittleEndian(
                new BigInteger("27742317777372353535851937790883648493")
                        .add(BigInteger.TWO.pow(252))
                        .toByteArray(), 32);
        System.arraycopy(order, 0, signature, 32, 32);
        assertFalse(Ed25519.verify(raw, message, signature));
    }

    private static byte[] bigEndianToLittleEndian(byte[] bigEndian, int length) {
        byte[] out = new byte[length];
        for (int i = 0; i < length; i++) {
            int source = bigEndian.length - 1 - i;
            out[i] = source >= 0 ? bigEndian[source] : 0;
        }
        return out;
    }
}
