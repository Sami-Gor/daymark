package io.github.sami_gor.daymark.voice;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;

/**
 * Crash-safe materialisation of the Parakeet model assets.
 *
 * <p>Each asset is copied to a temporary file in the model directory, synced to
 * disk, checked against the pinned length and SHA-256 digest, and only then
 * renamed over the final path. A crash or an I/O error therefore leaves either
 * the previous file or no file at the final path, never a half-written one.
 *
 * <p>Pure Java (no Android types) so the copy, verification and cleanup paths
 * can be exercised with temporary directories and synthetic assets.
 */
public final class ParakeetModelInstaller {

    /** Suffix of the temporary file used while an asset is being copied. */
    public static final String TEMP_SUFFIX = ".part";

    private ParakeetModelInstaller() {
    }

    /** Supplies the bytes of one packaged asset. */
    public interface AssetSource {
        InputStream open(String fileName) throws IOException;
    }

    /** A materialisation failure with a stable, explicit reason. */
    public static final class InstallException extends IOException {
        private final String reason;

        public InstallException(String reason) {
            super(reason);
            this.reason = reason;
        }

        public InstallException(String reason, Throwable cause) {
            super(reason, cause);
            this.reason = reason;
        }

        public String reason() {
            return reason;
        }
    }

    /**
     * Installs every file that {@code verification} did not confirm.
     *
     * <p>Files already hashed and verified by
     * {@link ParakeetModelIntegrity#verify} are not copied or read again. After
     * a successful install the verification marker is refreshed.
     */
    public static void install(
            File directory,
            ParakeetModelIntegrity.Result verification,
            String modelVersion,
            String[] names,
            long[] sizes,
            String[] digests,
            AssetSource source) throws IOException {
        if (directory == null
                || modelVersion == null
                || names == null
                || sizes == null
                || digests == null
                || source == null
                || names.length == 0
                || names.length != sizes.length
                || names.length != digests.length) {
            throw new InstallException("invalid-arguments");
        }
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new InstallException("cannot-create-model-directory");
        }

        List<ParakeetModelIntegrity.FileState> installed = new ArrayList<>(names.length);
        for (int index = 0; index < names.length; index++) {
            String name = names[index];
            File target = new File(directory, name);
            ParakeetModelIntegrity.FileState alreadyVerified =
                    verification == null ? null : verification.fileState(name);
            if (alreadyVerified != null && alreadyVerified.matches(target)) {
                installed.add(alreadyVerified);
                continue;
            }

            File temp = new File(directory, name + TEMP_SUFFIX);
            if (temp.exists() && !temp.delete()) {
                throw new InstallException("cannot-remove-stale-temp:" + name);
            }
            try {
                copyAndVerify(source, name, temp, sizes[index], digests[index]);
                if (!ParakeetModelIntegrity.moveReplace(temp, target)) {
                    throw new InstallException("atomic-replace-failed:" + name);
                }
                long sizeAfterMove = target.length();
                if (sizeAfterMove != sizes[index]) {
                    throw new InstallException("post-move-size-mismatch:" + name + ":"
                            + sizes[index] + ":" + sizeAfterMove);
                }
                installed.add(new ParakeetModelIntegrity.FileState(
                        name, sizeAfterMove, target.lastModified(), digests[index]));
            } catch (IOException | RuntimeException failure) {
                // The previous file failed verification (or is absent), so
                // remove it too: corrupt material must never be left at a
                // final path for a later run to load.
                removeQuietly(temp);
                removeQuietly(target);
                if (failure instanceof InstallException) {
                    throw (InstallException) failure;
                }
                throw new InstallException("copy-failed:" + name, failure);
            }
        }

        ParakeetModelIntegrity.VerifiedState state =
                ParakeetModelIntegrity.VerifiedState.of(modelVersion, installed);
        try {
            state.write(new File(directory, ParakeetModelIntegrity.MARKER_FILE_NAME));
        } catch (IOException ignored) {
            // The installed bytes were verified in this run. If the marker
            // cannot be persisted, the next start hashes the files again
            // rather than trusting unverified content.
        }
    }

    /** Removes model files, temporary copies and the marker. Best effort. */
    public static void deleteModelFiles(File directory, String[] names) {
        if (directory == null) {
            return;
        }
        if (names != null) {
            for (String name : names) {
                removeQuietly(new File(directory, name));
                removeQuietly(new File(directory, name + TEMP_SUFFIX));
            }
        }
        removeQuietly(new File(directory, ParakeetModelIntegrity.MARKER_FILE_NAME));
        removeQuietly(new File(directory,
                ParakeetModelIntegrity.MARKER_FILE_NAME + ".tmp"));
    }

    private static void copyAndVerify(
            AssetSource source,
            String fileName,
            File temp,
            long expectedSize,
            String expectedDigest) throws IOException {
        MessageDigest digest = newSha256();
        long total = 0;
        try (InputStream input = source.open(fileName);
             FileOutputStream output = new FileOutputStream(temp)) {
            byte[] buffer = new byte[ParakeetModelIntegrity.BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (read == 0) {
                    continue;
                }
                output.write(buffer, 0, read);
                digest.update(buffer, 0, read);
                total += read;
            }
            output.flush();
            output.getFD().sync();
        }
        if (total != expectedSize) {
            throw new InstallException("asset-size-mismatch:" + fileName + ":"
                    + expectedSize + ":" + total);
        }
        String actual = hex(digest.digest());
        if (!actual.equals(expectedDigest)) {
            throw new InstallException("asset-sha256-mismatch:" + fileName + ":"
                    + expectedDigest + ":" + actual);
        }
    }

    private static MessageDigest newSha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    private static String hex(byte[] bytes) {
        char[] digits = "0123456789abcdef".toCharArray();
        char[] output = new char[bytes.length * 2];
        for (int index = 0; index < bytes.length; index++) {
            int value = bytes[index] & 0xff;
            output[index * 2] = digits[value >>> 4];
            output[index * 2 + 1] = digits[value & 0x0f];
        }
        return new String(output);
    }

    private static void removeQuietly(File file) {
        if (file != null && file.exists()) {
            file.delete();
        }
    }
}
