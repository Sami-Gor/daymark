package io.github.sami_gor.daymark.packs;

import java.math.BigInteger;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Dependency-free Ed25519 <em>verification</em> (RFC 8032).
 *
 * <p>Android only exposes {@code Signature.getInstance("Ed25519")} from API 33
 * (Conscrypt 2.6), while Daymark's minimum is API 29. Bundling a verifier keeps
 * pack signature checking available on every supported device without adding a
 * Gradle dependency. Only verification is implemented; signing happens in the
 * release tooling.
 *
 * <p>This is deliberately small and slow rather than clever: affine decisions
 * use BigInteger, extended coordinates avoid per-operation inversions, and the
 * public-key/point encodings are required to be canonical. Verification uses
 * public data only, so constant-time behaviour is not required for
 * confidentiality. The JVM tests cross-check this implementation against the
 * JDK's Ed25519 signer for generated keys.
 */
final class Ed25519 {

    static final int PUBLIC_KEY_BYTES = 32;
    static final int SIGNATURE_BYTES = 64;

    private static final BigInteger ZERO = BigInteger.ZERO;
    private static final BigInteger ONE = BigInteger.ONE;
    private static final BigInteger TWO = BigInteger.valueOf(2);
    private static final BigInteger THREE = BigInteger.valueOf(3);
    private static final BigInteger FIVE = BigInteger.valueOf(5);
    private static final BigInteger SEVEN = BigInteger.valueOf(7);
    private static final BigInteger EIGHT = BigInteger.valueOf(8);

    private static final BigInteger P =
            TWO.pow(255).subtract(BigInteger.valueOf(19));
    private static final BigInteger L =
            TWO.pow(252).add(new BigInteger("27742317777372353535851937790883648493"));
    private static final BigInteger D = BigInteger.valueOf(-121665)
            .multiply(BigInteger.valueOf(121666).modInverse(P))
            .mod(P);
    private static final BigInteger SQRT_M1 =
            TWO.modPow(P.subtract(ONE).divide(BigInteger.valueOf(4)), P);
    private static final Point BASE = decodeBasePoint();

    private Ed25519() {
    }

    /**
     * True for a canonical, non-small-order point that can be used as a trust
     * anchor. This prevents an all-zero or low-order "key" from making every
     * signature verifiable.
     */
    static boolean isUsablePublicKey(byte[] publicKey) {
        if (publicKey == null || publicKey.length != PUBLIC_KEY_BYTES) {
            return false;
        }
        Point point = decodePoint(publicKey);
        if (point == null || !java.util.Arrays.equals(encodePoint(point), publicKey)) {
            return false;
        }
        Point eightTimes = scalarMultiply(BigInteger.valueOf(8), point);
        return !pointsEqual(eightTimes, Point.IDENTITY);
    }

    static boolean verify(byte[] publicKey, byte[] message, byte[] signature) {
        if (publicKey == null || publicKey.length != PUBLIC_KEY_BYTES
                || message == null || signature == null
                || signature.length != SIGNATURE_BYTES) {
            return false;
        }
        Point a = decodePoint(publicKey);
        byte[] rBytes = new byte[PUBLIC_KEY_BYTES];
        System.arraycopy(signature, 0, rBytes, 0, PUBLIC_KEY_BYTES);
        Point r = decodePoint(rBytes);
        if (a == null || r == null) {
            return false;
        }
        BigInteger s = littleEndian(signature, PUBLIC_KEY_BYTES, PUBLIC_KEY_BYTES);
        if (s.compareTo(L) >= 0) {
            return false;
        }
        byte[] digest = sha512(
                rBytes, publicKey, message);
        BigInteger k = littleEndian(digest, 0, digest.length).mod(L);
        Point left = scalarMultiply(s, BASE);
        Point right = add(r, scalarMultiply(k, a));
        return pointsEqual(left, right)
                && java.util.Arrays.equals(encodePoint(a), publicKey)
                && java.util.Arrays.equals(encodePoint(r), rBytes);
    }

    private static byte[] sha512(byte[] first, byte[] second, byte[] third) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-512");
            digest.update(first);
            digest.update(second);
            digest.update(third);
            return digest.digest();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-512 unavailable", e);
        }
    }

    private static Point decodeBasePoint() {
        byte[] encoded = new byte[PUBLIC_KEY_BYTES];
        encoded[0] = 0x58;
        for (int i = 1; i < encoded.length; i++) {
            encoded[i] = 0x66;
        }
        Point point = decodePoint(encoded);
        if (point == null) {
            throw new IllegalStateException("invalid Ed25519 base point");
        }
        return point;
    }

    private static Point decodePoint(byte[] encoded) {
        if (encoded == null || encoded.length != PUBLIC_KEY_BYTES) {
            return null;
        }
        int sign = (encoded[31] & 0x80) >>> 7;
        byte[] yBytes = encoded.clone();
        yBytes[31] &= 0x7f;
        BigInteger y = littleEndian(yBytes, 0, PUBLIC_KEY_BYTES);
        if (y.compareTo(P) >= 0) {
            return null;
        }
        BigInteger ySquared = y.multiply(y).mod(P);
        BigInteger u = ySquared.subtract(ONE).mod(P);
        BigInteger v = D.multiply(ySquared).add(ONE).mod(P);
        BigInteger x = squareRootRatio(u, v);
        if (x == null) {
            return null;
        }
        if (x.signum() == 0 && sign == 1) {
            return null;
        }
        if (x.testBit(0) != (sign == 1)) {
            x = P.subtract(x);
        }
        Point point = new Point(x, y, ONE, x.multiply(y).mod(P));
        return isOnCurve(point) ? point : null;
    }

    private static BigInteger squareRootRatio(BigInteger u, BigInteger v) {
        BigInteger v3 = v.modPow(THREE, P);
        BigInteger v7 = v.modPow(SEVEN, P);
        BigInteger exponent = P.subtract(FIVE).divide(EIGHT);
        BigInteger x = u.multiply(v3)
                .multiply(u.multiply(v7).modPow(exponent, P))
                .mod(P);
        BigInteger check = v.multiply(x).multiply(x).mod(P);
        if (check.equals(u)) {
            return x;
        }
        if (check.equals(P.subtract(u).mod(P))) {
            return x.multiply(SQRT_M1).mod(P);
        }
        return null;
    }

    private static boolean isOnCurve(Point point) {
        BigInteger xSquared = point.x.multiply(point.x).mod(P);
        BigInteger ySquared = point.y.multiply(point.y).mod(P);
        BigInteger left = ySquared.subtract(xSquared).mod(P);
        BigInteger right = ONE.add(D.multiply(xSquared).multiply(ySquared)).mod(P);
        return left.equals(right);
    }

    private static Point scalarMultiply(BigInteger scalar, Point point) {
        Point result = Point.IDENTITY;
        for (int bit = 255; bit >= 0; bit--) {
            result = doublePoint(result);
            if (scalar.testBit(bit)) {
                result = add(result, point);
            }
        }
        return result;
    }

    private static Point add(Point p, Point q) {
        BigInteger a = p.y.subtract(p.x).multiply(q.y.subtract(q.x)).mod(P);
        BigInteger b = p.y.add(p.x).multiply(q.y.add(q.x)).mod(P);
        BigInteger c = p.t.multiply(TWO).multiply(D).multiply(q.t).mod(P);
        BigInteger d = p.z.multiply(TWO).multiply(q.z).mod(P);
        BigInteger e = b.subtract(a).mod(P);
        BigInteger f = d.subtract(c).mod(P);
        BigInteger g = d.add(c).mod(P);
        BigInteger h = b.add(a).mod(P);
        return new Point(
                e.multiply(f).mod(P),
                g.multiply(h).mod(P),
                f.multiply(g).mod(P),
                e.multiply(h).mod(P));
    }

    private static Point doublePoint(Point p) {
        BigInteger a = p.x.multiply(p.x).mod(P);
        BigInteger b = p.y.multiply(p.y).mod(P);
        BigInteger c = TWO.multiply(p.z).multiply(p.z).mod(P);
        BigInteger d = a.negate().mod(P);
        BigInteger e = p.x.add(p.y).multiply(p.x.add(p.y)).subtract(a).subtract(b).mod(P);
        BigInteger g = d.add(b).mod(P);
        BigInteger f = g.subtract(c).mod(P);
        BigInteger h = d.subtract(b).mod(P);
        return new Point(
                e.multiply(f).mod(P),
                g.multiply(h).mod(P),
                f.multiply(g).mod(P),
                e.multiply(h).mod(P));
    }

    private static boolean pointsEqual(Point p, Point q) {
        BigInteger pzq = p.z.multiply(q.z).mod(P);
        // Avoid inversions: X1/Z1 == X2/Z2 iff X1*Z2 == X2*Z1 (same for Y).
        return p.x.multiply(q.z).mod(P).equals(q.x.multiply(p.z).mod(P))
                && p.y.multiply(q.z).mod(P).equals(q.y.multiply(p.z).mod(P))
                && !pzq.equals(ZERO);
    }

    private static byte[] encodePoint(Point point) {
        BigInteger zInverse = point.z.modInverse(P);
        BigInteger x = point.x.multiply(zInverse).mod(P);
        BigInteger y = point.y.multiply(zInverse).mod(P);
        byte[] encoded = littleEndianBytes(y, PUBLIC_KEY_BYTES);
        if (x.testBit(0)) {
            encoded[31] |= 0x80;
        }
        return encoded;
    }

    private static BigInteger littleEndian(byte[] bytes, int offset, int length) {
        byte[] bigEndian = new byte[length];
        for (int i = 0; i < length; i++) {
            bigEndian[length - 1 - i] = bytes[offset + i];
        }
        return new BigInteger(1, bigEndian);
    }

    private static byte[] littleEndianBytes(BigInteger value, int length) {
        byte[] bigEndian = value.toByteArray();
        if (bigEndian.length > length + 1) {
            throw new IllegalArgumentException("value does not fit");
        }
        byte[] encoded = new byte[length];
        for (int i = 0; i < length; i++) {
            int source = bigEndian.length - 1 - i;
            encoded[i] = source >= 0 ? bigEndian[source] : 0;
        }
        return encoded;
    }

    private static final class Point {
        static final Point IDENTITY = new Point(ZERO, ONE, ONE, ZERO);

        final BigInteger x;
        final BigInteger y;
        final BigInteger z;
        final BigInteger t;

        Point(BigInteger x, BigInteger y, BigInteger z, BigInteger t) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.t = t;
        }
    }
}
