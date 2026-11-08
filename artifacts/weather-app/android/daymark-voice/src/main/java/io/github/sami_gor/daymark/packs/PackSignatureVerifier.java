package io.github.sami_gor.daymark.packs;

/**
 * Verifies the detached Ed25519 signature over a manifest's canonical bytes.
 *
 * <p>The signature is the 64-byte RFC 8032 detached signature, stored beside
 * the manifest (for example {@code manifest.json.sig}). It must be produced
 * over {@link PackManifest#canonicalBytes()} exactly. Verification is
 * independent of Android's platform crypto so it works on API 29; see
 * {@link Ed25519}.
 *
 * <p>Authenticity chain: pinned trust anchor → manifest signature → manifest's
 * payload SHA-256 → verified payload bytes. A checksum without a signature is
 * an integrity check, not an authenticity check.
 */
public final class PackSignatureVerifier {

    public static final int SIGNATURE_BYTES = 64;

    private final PackTrustAnchor anchor;

    public PackSignatureVerifier(PackTrustAnchor anchor) {
        if (anchor == null) {
            throw new IllegalArgumentException("a pinned trust anchor is required");
        }
        this.anchor = anchor;
    }

    /** Thrown when the detached signature is missing, malformed or wrong. */
    public static final class SignatureException extends Exception {
        public final String reason;

        SignatureException(String reason, String message) {
            super(message);
            this.reason = reason;
        }
    }

    public void verify(PackManifest manifest, byte[] signature) throws SignatureException {
        if (manifest == null) {
            throw new SignatureException("missing-manifest", "manifest is missing");
        }
        verify(manifest.canonicalBytes(), signature);
    }

    /**
     * Verifies {@code signature} over exactly {@code canonicalMessage}. Exposed
     * so release tooling and tests can exercise the primitive without parsing a
     * manifest.
     */
    public void verify(byte[] canonicalMessage, byte[] signature) throws SignatureException {
        if (signature == null) {
            throw new SignatureException("missing-signature",
                    "pack manifest signature is missing");
        }
        if (signature.length != SIGNATURE_BYTES) {
            throw new SignatureException("malformed-signature",
                    "Ed25519 signature must be 64 bytes");
        }
        if (canonicalMessage == null) {
            throw new SignatureException("missing-manifest", "canonical manifest bytes are missing");
        }
        if (!Ed25519.verify(anchor.rawPublicKey(), canonicalMessage, signature)) {
            throw new SignatureException("signature-mismatch",
                    "manifest signature does not match the pinned trust anchor");
        }
    }
}
