package io.github.sami_gor.daymark.tts;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * SHA-256 verification for the bundled Kokoro model and voice assets.
 *
 * <p>The Kokoro files are packaged inside the APK and copied into app-private
 * storage on first use. A size-only check would accept a same-size tampered or
 * corrupted file, so the copied bytes are verified against the digests the
 * build-time fetch script pins. Pure Java so the checks are JVM-testable.
 */
final class KokoroAssetIntegrity {

    private static final int BUFFER_SIZE = 64 * 1024;

    private KokoroAssetIntegrity() {
    }

    /** True when the file exists, has the exact size and matches the digest. */
    static boolean matches(File file, long expectedSize, String expectedSha256) {
        if (file == null || expectedSha256 == null || !file.isFile() || file.length() != expectedSize) {
            return false;
        }
        try {
            return sha256(file).equals(expectedSha256);
        } catch (IOException unreadable) {
            return false;
        }
    }

    static String sha256(File file) throws IOException {
        MessageDigest digest = newSha256();
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (read > 0) {
                    digest.update(buffer, 0, read);
                }
            }
        }
        return hex(digest.digest());
    }

    static MessageDigest newSha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    static String hex(byte[] bytes) {
        char[] digits = "0123456789abcdef".toCharArray();
        char[] output = new char[bytes.length * 2];
        for (int index = 0; index < bytes.length; index++) {
            int value = bytes[index] & 0xff;
            output[index * 2] = digits[value >>> 4];
            output[index * 2 + 1] = digits[value & 0x0f];
        }
        return new String(output);
    }
}
