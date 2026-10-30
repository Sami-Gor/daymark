package io.github.sami_gor.daymark.voice;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Content verification for the materialised Parakeet model.
 *
 * <p>The model files are large enough that loading them into memory to check
 * them is not acceptable, so every digest is produced by streaming the file
 * through a small fixed buffer. Verification is fail-closed: a file is usable
 * only when its length and its SHA-256 digest both match the pinned values.
 *
 * <p>Hashing 670 MB takes seconds, so a successful verification is recorded in
 * a {@link VerifiedState marker} next to the files. On later starts the marker
 * is accepted only when it was written for the same {@code modelVersion}, its
 * recorded digests still equal the pinned digests, and every file still exists
 * with the recorded length and modification time. Anything else forces a full
 * re-hash; a stale or malformed marker can never make an unverified file load.
 *
 * <p>This class deliberately uses no Android types, so the whole flow can be
 * unit-tested on the JVM with temporary directories and tiny synthetic files.
 */
public final class ParakeetModelIntegrity {

    /** Name of the verification marker inside the model directory. */
    public static final String MARKER_FILE_NAME = ".parakeet-model-verified";

    /** Buffer used for every streamed read and digest. Never grows with file size. */
    public static final int BUFFER_SIZE = 64 * 1024;

    private static final int MARKER_FORMAT_VERSION = 1;
    private static final String MARKER_MAGIC = "daymark-parakeet-integrity";
    private static final String MARKER_TEMP_SUFFIX = ".tmp";
    private static final int MAX_MARKER_BYTES = 64 * 1024;

    /**
     * True when {@code java.nio.file} exists (Android 8.0/API 26 and newer).
     * API 24 and 25 fall back to {@link File#renameTo(File)}, which is a POSIX
     * rename on Android and is atomic within one directory.
     */
    private static final boolean NIO_FILES_AVAILABLE = nioFilesAvailable();

    private ParakeetModelIntegrity() {
    }

    /** Outcome of checking a directory. Every non-{@link Status#OK} status is corrupt for load purposes. */
    public enum Status {
        /** Every file exists and matches its pinned length and digest. */
        OK,
        /** No model file exists yet, so the model has not been materialised. */
        MISSING,
        /** At least one file is missing, truncated, unreadable or has the wrong digest. */
        CORRUPT,
    }

    /** Immutable size, modification time and digest of one verified file. */
    public static final class FileState {
        private final String name;
        private final long size;
        private final long lastModified;
        private final String sha256;

        FileState(String name, long size, long lastModified, String sha256) {
            this.name = name;
            this.size = size;
            this.lastModified = lastModified;
            this.sha256 = sha256;
        }

        public String name() {
            return name;
        }

        public long size() {
            return size;
        }

        public long lastModified() {
            return lastModified;
        }

        public String sha256() {
            return sha256;
        }

        /** Whether the file on disk still looks exactly like the recorded state. */
        boolean matches(File file) {
            return file.isFile()
                    && file.canRead()
                    && file.length() == size
                    && file.lastModified() == lastModified;
        }
    }

    /**
     * The marker written after a successful verification.
     *
     * <p>The text body is checksummed so accidental corruption is rejected
     * before it is trusted. The pinned digests are checked separately by
     * {@link #verify}; a marker whose digests differ from the pinned values is
     * never accepted, even if its own checksum is valid.
     */
    public static final class VerifiedState {
        private final String modelVersion;
        private final Map<String, FileState> files;

        private VerifiedState(String modelVersion, Map<String, FileState> files) {
            this.modelVersion = modelVersion;
            this.files = Collections.unmodifiableMap(new LinkedHashMap<>(files));
        }

        static VerifiedState of(String modelVersion, List<FileState> files) {
            Map<String, FileState> byName = new LinkedHashMap<>();
            for (FileState file : files) {
                byName.put(file.name(), file);
            }
            return new VerifiedState(modelVersion, byName);
        }

        public String modelVersion() {
            return modelVersion;
        }

        public List<FileState> files() {
            return new ArrayList<>(files.values());
        }

        public FileState file(String name) {
            return files.get(name);
        }

        /**
         * Reads a marker, or returns {@code null} when it is absent, malformed,
         * truncated or fails its own checksum.
         */
        public static VerifiedState read(File markerFile) {
            if (markerFile == null || !markerFile.isFile()) {
                return null;
            }
            final byte[] bytes;
            try {
                bytes = readAll(markerFile);
            } catch (IOException unreadable) {
                return null;
            }
            if (bytes.length == 0 || bytes.length > MAX_MARKER_BYTES) {
                return null;
            }
            String text = new String(bytes, StandardCharsets.US_ASCII);
            if (!text.endsWith("\n")) {
                return null;
            }
            String[] lines = text.substring(0, text.length() - 1).split("\n", -1);
            if (lines.length < 6) {
                return null;
            }
            int checksumIndex = lines.length - 1;
            String checksumPrefix = "checksum=";
            if (!lines[checksumIndex].startsWith(checksumPrefix)) {
                return null;
            }
            String declaredChecksum = lines[checksumIndex].substring(checksumPrefix.length());
            if (!isSha256(declaredChecksum)) {
                return null;
            }
            String body = text.substring(0, text.length() - (lines[checksumIndex].length() + 1));
            if (!declaredChecksum.equals(sha256Hex(body.getBytes(StandardCharsets.US_ASCII)))) {
                return null;
            }
            if (!MARKER_MAGIC.equals(lines[0])
                    || !("format=" + MARKER_FORMAT_VERSION).equals(lines[1])
                    || !lines[2].startsWith("model=")
                    || !lines[3].startsWith("files=")) {
                return null;
            }
            String version = lines[2].substring("model=".length());
            if (version.isEmpty()) {
                return null;
            }
            final int count;
            try {
                count = Integer.parseInt(lines[3].substring("files=".length()));
            } catch (NumberFormatException malformed) {
                return null;
            }
            if (count < 0 || lines.length != count + 5) {
                return null;
            }
            Map<String, FileState> parsed = new LinkedHashMap<>();
            for (int index = 0; index < count; index++) {
                String[] parts = lines[4 + index].split("\\|", -1);
                if (parts.length != 4 || parts[0].isEmpty() || !isSha256(parts[3])) {
                    return null;
                }
                final long size;
                final long lastModified;
                try {
                    size = Long.parseLong(parts[1]);
                    lastModified = Long.parseLong(parts[2]);
                } catch (NumberFormatException malformed) {
                    return null;
                }
                if (size < 0 || lastModified < 0 || parsed.containsKey(parts[0])) {
                    return null;
                }
                parsed.put(parts[0], new FileState(parts[0], size, lastModified, parts[3]));
            }
            return new VerifiedState(version, parsed);
        }

        /**
         * Writes the marker atomically: a sync'd temporary file in the same
         * directory is renamed over the previous marker, so a crash leaves
         * either the old marker or the new one, never a partial file.
         */
        public void write(File markerFile) throws IOException {
            File absolute = markerFile.getAbsoluteFile();
            File parent = absolute.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                throw new IOException("cannot create the model directory");
            }
            StringBuilder body = new StringBuilder();
            body.append(MARKER_MAGIC).append('\n');
            body.append("format=").append(MARKER_FORMAT_VERSION).append('\n');
            body.append("model=").append(modelVersion).append('\n');
            body.append("files=").append(files.size()).append('\n');
            for (FileState file : files.values()) {
                body.append(file.name()).append('|')
                        .append(file.size()).append('|')
                        .append(file.lastModified()).append('|')
                        .append(file.sha256()).append('\n');
            }
            String bodyText = body.toString();
            String content = bodyText
                    + "checksum=" + sha256Hex(bodyText.getBytes(StandardCharsets.US_ASCII)) + "\n";
            File temp = new File(parent, absolute.getName() + MARKER_TEMP_SUFFIX);
            try (FileOutputStream output = new FileOutputStream(temp)) {
                output.write(content.getBytes(StandardCharsets.US_ASCII));
                output.flush();
                output.getFD().sync();
            } catch (IOException failure) {
                deleteQuietly(temp);
                throw failure;
            }
            if (!moveReplace(temp, absolute)) {
                deleteQuietly(temp);
                throw new IOException("cannot replace the integrity marker atomically");
            }
        }

        boolean matchesPinned(String expectedVersion, String[] names, long[] sizes, String[] digests) {
            if (!modelVersion.equals(expectedVersion) || files.size() != names.length) {
                return false;
            }
            for (int index = 0; index < names.length; index++) {
                FileState state = files.get(names[index]);
                if (state == null
                        || state.size() != sizes[index]
                        || !state.sha256().equals(digests[index])) {
                    return false;
                }
            }
            return true;
        }
    }

    /** Result of {@link #verify}. */
    public static final class Result {
        private final Status status;
        private final String reason;
        private final boolean markerAccepted;
        private final int filesHashed;
        private final Map<String, FileState> verifiedFiles;

        private Result(
                Status status,
                String reason,
                boolean markerAccepted,
                int filesHashed,
                Map<String, FileState> verifiedFiles) {
            this.status = status;
            this.reason = reason;
            this.markerAccepted = markerAccepted;
            this.filesHashed = filesHashed;
            this.verifiedFiles = Collections.unmodifiableMap(new LinkedHashMap<>(verifiedFiles));
        }

        public Status status() {
            return status;
        }

        public boolean isOk() {
            return status == Status.OK;
        }

        /** Empty when the result is OK; otherwise an explicit, stable reason. */
        public String reason() {
            return reason;
        }

        /** True when the marker allowed the digest pass to be skipped. */
        public boolean markerAccepted() {
            return markerAccepted;
        }

        /** Number of files actually streamed through SHA-256 during this call. */
        public int filesHashed() {
            return filesHashed;
        }

        public boolean isFileVerified(String name) {
            return verifiedFiles.containsKey(name);
        }

        public FileState fileState(String name) {
            return verifiedFiles.get(name);
        }
    }

    /**
     * Verifies every pinned file in {@code directory}.
     *
     * <p>A valid marker lets the call skip hashing, but only after every file
     * has been confirmed to exist with the recorded size and modification time.
     * In every other case all present files are hashed and checked against the
     * pinned digests. On a successful re-hash the marker is refreshed.
     */
    public static Result verify(
            File directory,
            String modelVersion,
            String[] names,
            long[] sizes,
            String[] digests) {
        if (directory == null
                || modelVersion == null
                || names == null
                || sizes == null
                || digests == null
                || names.length == 0
                || names.length != sizes.length
                || names.length != digests.length) {
            return new Result(Status.CORRUPT, "invalid-arguments", false, 0,
                    Collections.emptyMap());
        }

        File markerFile = new File(directory, MARKER_FILE_NAME);
        VerifiedState marker = VerifiedState.read(markerFile);
        if (marker != null && marker.matchesPinned(modelVersion, names, sizes, digests)) {
            boolean filesMatch = true;
            for (String name : names) {
                FileState state = marker.file(name);
                if (state == null || !state.matches(new File(directory, name))) {
                    filesMatch = false;
                    break;
                }
            }
            if (filesMatch) {
                return new Result(Status.OK, "", true, 0, marker.files);
            }
        }

        Map<String, FileState> verified = new LinkedHashMap<>();
        int hashed = 0;
        String firstProblem = null;
        boolean allMissing = true;

        for (int index = 0; index < names.length; index++) {
            String name = names[index];
            File file = new File(directory, name);
            if (!file.exists()) {
                if (firstProblem == null) {
                    firstProblem = "missing:" + name;
                }
                continue;
            }
            allMissing = false;
            if (!file.isFile()) {
                if (firstProblem == null) {
                    firstProblem = "not-a-file:" + name;
                }
                continue;
            }
            long length = file.length();
            if (length == 0) {
                if (firstProblem == null) {
                    firstProblem = "empty:" + name;
                }
                continue;
            }
            if (length != sizes[index]) {
                if (firstProblem == null) {
                    firstProblem = "size-mismatch:" + name + ":"
                            + sizes[index] + ":" + length;
                }
                continue;
            }
            final FileState state;
            try {
                state = hashFile(file, name);
                hashed++;
            } catch (ChangedDuringReadException changed) {
                if (firstProblem == null) {
                    firstProblem = "changed-during-read:" + name;
                }
                continue;
            } catch (IOException unreadable) {
                if (firstProblem == null) {
                    firstProblem = "unreadable:" + name + ":"
                            + unreadable.getClass().getSimpleName();
                }
                continue;
            }
            if (!state.sha256().equals(digests[index])) {
                if (firstProblem == null) {
                    firstProblem = "sha256-mismatch:" + name + ":"
                            + digests[index] + ":" + state.sha256();
                }
                continue;
            }
            verified.put(name, state);
        }

        if (firstProblem == null) {
            List<FileState> ordered = new ArrayList<>(names.length);
            for (String name : names) {
                ordered.add(verified.get(name));
            }
            VerifiedState fresh = VerifiedState.of(modelVersion, ordered);
            try {
                fresh.write(markerFile);
            } catch (IOException ignored) {
                // The content is verified for this run. If the marker cannot be
                // written, the next start simply re-hashes instead of trusting
                // anything unverified.
            }
            return new Result(Status.OK, "", false, hashed, verified);
        }

        Status status = allMissing ? Status.MISSING : Status.CORRUPT;
        return new Result(status, firstProblem, false, hashed, verified);
    }

    /** Streams one file through SHA-256 and returns its lowercase hex digest. */
    public static String sha256(File file) throws IOException {
        return hashFile(file, file.getName()).sha256();
    }

    /**
     * Atomically replaces {@code target} with {@code source}.
     *
     * <p>{@code java.nio.file.Files} exists only on Android 8.0 (API 26) and
     * newer; the check below is resolved at runtime, so API 24 and 25 use the
     * POSIX rename provided by {@link File#renameTo(File)} instead.
     */
    static boolean moveReplace(File source, File target) throws IOException {
        if (NIO_FILES_AVAILABLE) {
            try {
                NioMover.move(source, target);
                return true;
            } catch (IOException failure) {
                if (!"AtomicMoveNotSupportedException".equals(
                        failure.getClass().getSimpleName())) {
                    throw failure;
                }
                // Fall through to renameTo, still atomic on the same directory.
            }
        }
        if (target.exists() && !target.delete()) {
            return false;
        }
        return source.renameTo(target);
    }

    /** Kept in a nested class so API 24 never resolves {@code java.nio.file}. */
    private static final class NioMover {
        // The class is only loaded after nioFilesAvailable() has confirmed that
        // java.nio.file exists, which is Android 8.0/API 26 and newer.
        @SuppressWarnings("NewApi")
        static void move(File source, File target) throws IOException {
            java.nio.file.Files.move(
                    source.toPath(),
                    target.toPath(),
                    java.nio.file.StandardCopyOption.ATOMIC_MOVE,
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static boolean nioFilesAvailable() {
        try {
            Class.forName("java.nio.file.Files", false, ParakeetModelIntegrity.class.getClassLoader());
            return true;
        } catch (ClassNotFoundException unavailableOnApi24) {
            return false;
        } catch (LinkageError unavailable) {
            return false;
        }
    }

    private static FileState hashFile(File file, String name) throws IOException {
        long lengthBefore = file.length();
        long modifiedBefore = file.lastModified();
        MessageDigest digest = newSha256();
        long total = 0;
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (read == 0) {
                    continue;
                }
                digest.update(buffer, 0, read);
                total += read;
            }
        }
        if (total != lengthBefore
                || file.length() != lengthBefore
                || file.lastModified() != modifiedBefore) {
            throw new ChangedDuringReadException();
        }
        return new FileState(name, lengthBefore, modifiedBefore, hex(digest.digest()));
    }

    private static MessageDigest newSha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException impossible) {
            // SHA-256 is required by every Java and Android platform.
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    private static byte[] readAll(File file) throws IOException {
        try (InputStream input = new FileInputStream(file);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (read == 0) {
                    continue;
                }
                if (output.size() + read > MAX_MARKER_BYTES) {
                    throw new IOException("marker is too large");
                }
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private static String sha256Hex(byte[] bytes) {
        MessageDigest digest = newSha256();
        digest.update(bytes);
        return hex(digest.digest());
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

    private static boolean isSha256(String value) {
        if (value == null || value.length() != 64) {
            return false;
        }
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            boolean hex = (character >= '0' && character <= '9')
                    || (character >= 'a' && character <= 'f');
            if (!hex) {
                return false;
            }
        }
        return true;
    }

    private static void deleteQuietly(File file) {
        if (file != null && file.exists()) {
            // Best effort: a leftover temporary file is removed by the next
            // install even if this delete fails.
            file.delete();
        }
    }

    /** Internal signal that a file changed between stat and the end of the read. */
    private static final class ChangedDuringReadException extends IOException {
    }
}
