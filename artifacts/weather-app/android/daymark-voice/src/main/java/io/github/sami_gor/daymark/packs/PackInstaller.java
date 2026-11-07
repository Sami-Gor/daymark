package io.github.sami_gor.daymark.packs;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Installs, activates and removes optional narration-language packs.
 *
 * <p>This class is deliberately transport-free and UI-free: it takes a local
 * file that the download layer has already fetched, verifies size and SHA-256
 * while copying into staging, then activates the verified copy atomically. The
 * download layer is responsible for HTTPS, progress and the signed manifest;
 * this class never trusts a pack without re-hashing its bytes.
 *
 * <p>Layout under {@code root}:
 * <pre>
 *   staging/&lt;packId&gt;-&lt;version&gt;.part
 *   packs/&lt;packId&gt;/&lt;version&gt;/payload
 *   packs/&lt;packId&gt;/&lt;version&gt;/.ready
 *   packs/&lt;packId&gt;/current          (contains the active version, newline-terminated)
 * </pre>
 *
 * <p>Activation is a write-to-temp + atomic rename of {@code current}, so an
 * interrupted update leaves the previous working version active. English is
 * built in and cannot be removed through this API.
 */
public final class PackInstaller {

    /** Pack identifier for the non-removable, preinstalled English narration. */
    public static final String BUILTIN_ENGLISH = "en";

    private final File root;

    public PackInstaller(File root) {
        this.root = root;
    }

    /** Result of a successful installation. */
    public static final class Installed {
        public final String packId;
        public final long version;
        public final File directory;

        Installed(String packId, long version, File directory) {
            this.packId = packId;
            this.version = version;
            this.directory = directory;
        }
    }

    /** Thrown for any pack failure; {@link #reason} is stable for UI mapping. */
    public static final class PackException extends Exception {
        public final String reason;

        PackException(String reason, String message) {
            super(message);
            this.reason = reason;
        }
    }

    /**
     * Verifies {@code source} and installs it as {@code packId} version
     * {@code version}, leaving the previous version installed until activation
     * succeeds. The caller activates explicitly with {@link #activate}.
     */
    public Installed stage(String packId, long version, File source, long expectedSize, String expectedSha256)
            throws PackException {
        requirePackId(packId);
        if (version <= 0) {
            throw new PackException("invalid-version", "pack version must be positive");
        }
        if (expectedSize <= 0) {
            throw new PackException("invalid-size", "expected size must be positive");
        }
        if (expectedSha256 == null || !expectedSha256.matches("[0-9a-fA-F]{64}")) {
            throw new PackException("invalid-hash", "expected SHA-256 is not a 64-character hex digest");
        }
        if (source == null || !source.isFile()) {
            throw new PackException("missing-download", "downloaded pack file is missing");
        }
        if (source.length() != expectedSize) {
            throw new PackException("size-mismatch",
                    "downloaded size " + source.length() + " != expected " + expectedSize);
        }

        File staging = new File(root, "staging");
        File packs = new File(root, "packs");
        if (!staging.isDirectory() && !staging.mkdirs()) {
            throw new PackException("io", "cannot create staging directory");
        }
        if (!packs.isDirectory() && !packs.mkdirs()) {
            throw new PackException("io", "cannot create packs directory");
        }

        File part = new File(staging, packId + "-" + version + ".part");
        String actual;
        try {
            actual = copyAndHash(source, part);
        } catch (IOException e) {
            part.delete();
            throw new PackException("io", "staging copy failed: " + e.getMessage());
        }
        if (!expectedSha256.equalsIgnoreCase(actual)) {
            part.delete();
            throw new PackException("hash-mismatch",
                    "pack SHA-256 " + actual + " != expected " + expectedSha256);
        }

        File dir = new File(new File(packs, packId), Long.toString(version));
        File parent = dir.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            part.delete();
            throw new PackException("io", "cannot create pack directory");
        }
        if (dir.exists() && !deleteRecursively(dir)) {
            part.delete();
            throw new PackException("io", "cannot replace existing pack version directory");
        }
        if (!dir.mkdirs()) {
            part.delete();
            throw new PackException("io", "cannot create pack version directory");
        }
        if (!part.renameTo(new File(dir, "payload"))) {
            deleteRecursively(dir);
            part.delete();
            throw new PackException("io", "cannot move payload into place");
        }
        if (!writeMarker(new File(dir, ".ready"))) {
            deleteRecursively(dir);
            throw new PackException("io", "cannot write readiness marker");
        }
        return new Installed(packId, version, dir);
    }

    /** Atomically makes a staged version active; the previous version stays on disk. */
    public void activate(Installed installed) throws PackException {
        File dir = installed.directory;
        if (!new File(dir, ".ready").isFile() || !new File(dir, "payload").isFile()) {
            throw new PackException("not-ready", "pack is not fully staged");
        }
        File current = new File(new File(root, "packs"), installed.packId + "/current");
        File parent = current.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new PackException("io", "cannot create pack directory");
        }
        File temp = new File(current.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write((installed.version + "\n").getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (IOException e) {
            temp.delete();
            throw new PackException("io", "cannot write activation pointer: " + e.getMessage());
        }
        try {
            Files.move(temp.toPath(), current.toPath(),
                    StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            try {
                Files.move(temp.toPath(), current.toPath(), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException fallback) {
                temp.delete();
                throw new PackException("io", "cannot activate pack: " + fallback.getMessage());
            }
        }
    }

    /** Active version, or 0 when the pack is not installed. */
    public long activeVersion(String packId) {
        File current = new File(new File(root, "packs"), packId + "/current");
        if (!current.isFile()) {
            return 0;
        }
        try {
            String text = new String(Files.readAllBytes(current.toPath()), StandardCharsets.UTF_8).trim();
            return Long.parseLong(text);
        } catch (IOException | NumberFormatException e) {
            return 0;
        }
    }

    /** Payload directory of the active version, or null. */
    public File activePayload(String packId) {
        long version = activeVersion(packId);
        if (version <= 0) {
            return null;
        }
        File payload = new File(new File(root, "packs"), packId + "/" + version + "/payload");
        return payload.isFile() ? payload : null;
    }

    /**
     * Removes an optional pack. English is built in and cannot be removed; the
     * caller never gets a silent success for trying.
     */
    public void remove(String packId) throws PackException {
        if (BUILTIN_ENGLISH.equals(packId)) {
            throw new PackException("builtin-pack", "English narration cannot be removed");
        }
        requirePackId(packId);
        File dir = new File(new File(root, "packs"), packId);
        if (dir.exists() && !deleteRecursively(dir)) {
            throw new PackException("io", "cannot remove pack");
        }
    }

    private static void requirePackId(String packId) throws PackException {
        if (packId == null || !packId.matches("[a-z]{2}")) {
            throw new PackException("invalid-pack", "pack id must be a two-letter language code");
        }
    }

    private static String copyAndHash(File source, File target) throws IOException {
        MessageDigest digest = newDigest();
        try (InputStream in = new FileInputStream(source);
                FileOutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
                out.write(buffer, 0, read);
            }
            out.getFD().sync();
        }
        StringBuilder hex = new StringBuilder(64);
        for (byte b : digest.digest()) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    private static MessageDigest newDigest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static boolean writeMarker(File marker) {
        try (FileOutputStream out = new FileOutputStream(marker)) {
            out.write('1');
            out.getFD().sync();
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private static boolean deleteRecursively(File file) {
        if (file == null || !file.exists()) {
            return true;
        }
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    if (!deleteRecursively(child)) {
                        return false;
                    }
                }
            }
        }
        return file.delete();
    }
}
