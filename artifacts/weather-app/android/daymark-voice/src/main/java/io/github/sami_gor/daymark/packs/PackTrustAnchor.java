package io.github.sami_gor.daymark.packs;

import java.util.Arrays;

/**
 * Pinned Ed25519 public key used to authenticate pack manifests.
 *
 * <p>The anchor is configuration, not data: it must be delivered out-of-band
 * with the app, never downloaded next to the manifest it is supposed to
 * authenticate. A pack signature only proves that whoever holds the matching
 * private key signed the canonical manifest bytes; a manifest checksum alone
 * proves only that the payload matches a document the attacker may also have
 * replaced.
 *
 * <p><strong>Production:</strong> pin the release signing key controlled by the
 * Daymark release process. <strong>Development/tests:</strong> generate an
 * ephemeral key pair and use its public half. Never ship a generated test key
 * as the production anchor.
 */
public final class PackTrustAnchor {

    /** Fixed SubjectPublicKeyInfo prefix for a raw Ed25519 public key. */
    private static final byte[] X509_PREFIX = {
            0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00
    };

    private final byte[] rawPublicKey;

    public PackTrustAnchor(byte[] rawPublicKey) {
        if (!Ed25519.isUsablePublicKey(rawPublicKey)) {
            throw new IllegalArgumentException(
                    "trust anchor must be a canonical, non-small-order Ed25519 public key");
        }
        this.rawPublicKey = rawPublicKey.clone();
    }

    /**
     * Extracts the raw key from the fixed 44-byte Ed25519 X.509
     * SubjectPublicKeyInfo encoding produced by the JDK and Android tooling.
     */
    public static PackTrustAnchor fromX509(byte[] encoded) {
        if (encoded == null || encoded.length != 44) {
            throw new IllegalArgumentException("expected a 44-byte Ed25519 X.509 key");
        }
        for (int i = 0; i < X509_PREFIX.length; i++) {
            if (encoded[i] != X509_PREFIX[i]) {
                throw new IllegalArgumentException("not an Ed25519 SubjectPublicKeyInfo key");
            }
        }
        byte[] raw = Arrays.copyOfRange(encoded, X509_PREFIX.length, encoded.length);
        return new PackTrustAnchor(raw);
    }

    /** Defensive copy of the 32-byte raw public key. */
    public byte[] rawPublicKey() {
        return rawPublicKey.clone();
    }
}
