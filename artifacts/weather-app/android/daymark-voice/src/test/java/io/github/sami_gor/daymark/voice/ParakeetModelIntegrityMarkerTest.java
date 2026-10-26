package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Collections;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Marker-format and verify-result edge cases for the Parakeet model.
 *
 * <p>The happy path and the main corruption paths are covered by
 * {@link ParakeetModelIntegrityTest}. This class targets the marker parser's
 * fail-closed boundaries and the result object the installer consumes, using
 * signed synthetic markers so each malformed case reaches the parser instead
 * of being rejected as a checksum failure.
 */
public class ParakeetModelIntegrityMarkerTest {

    private static final String VERSION = "marker-synthetic-v1";
    private static final String[] NAMES = {"encoder.bin", "tokens.txt"};
    private static final long[] SIZES = {24L, 7L};
    private static final String MARKER_MAGIC = "daymark-parakeet-integrity";

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private File directory;
    private String[] digests;

    @Before
    public void setUp() throws IOException {
        directory = temporaryFolder.newFolder("model");
        byte[][] contents = {
            syntheticBytes(24, 5),
            "tokens\n".getBytes(StandardCharsets.US_ASCII),
        };
        digests = new String[NAMES.length];
        for (int index = 0; index < NAMES.length; index++) {
            File file = file(NAMES[index]);
            write(file, contents[index]);
            digests[index] = ParakeetModelIntegrity.sha256(file);
        }
    }

    @Test
    public void rejectsInvalidArgumentsWithoutTouchingTheFiles() {
        assertInvalid(ParakeetModelIntegrity.verify(null, VERSION, NAMES, SIZES, digests));
        assertInvalid(ParakeetModelIntegrity.verify(directory, null, NAMES, SIZES, digests));
        assertInvalid(ParakeetModelIntegrity.verify(directory, VERSION, null, SIZES, digests));
        assertInvalid(ParakeetModelIntegrity.verify(directory, VERSION, NAMES, null, digests));
        assertInvalid(ParakeetModelIntegrity.verify(directory, VERSION, NAMES, SIZES, null));
        assertInvalid(ParakeetModelIntegrity.verify(
                directory, VERSION, new String[0], new long[0], new String[0]));
        assertInvalid(ParakeetModelIntegrity.verify(
                directory, VERSION, NAMES, new long[] {24L}, digests));
        assertInvalid(ParakeetModelIntegrity.verify(
                directory, VERSION, NAMES, SIZES, new String[] {digests[0]}));
    }

    @Test
    public void treatsANonFileEntryAtTheFinalPathAsCorrupt() {
        File entry = file(NAMES[0]);
        assertTrue(entry.delete());
        assertTrue(entry.mkdir());

        ParakeetModelIntegrity.Result result = verify();

        assertFalse(result.isOk());
        assertEquals(ParakeetModelIntegrity.Status.CORRUPT, result.status());
        assertTrue(result.reason(), result.reason().startsWith("not-a-file:" + NAMES[0]));
    }

    @Test
    public void exposesOnlyTheFilesThatVerified() throws IOException {
        write(file(NAMES[1]), "tampered".getBytes(StandardCharsets.US_ASCII));

        ParakeetModelIntegrity.Result result = verify();

        assertFalse(result.isOk());
        assertTrue(result.isFileVerified(NAMES[0]));
        assertFalse(result.isFileVerified(NAMES[1]));
        assertNotNull(result.fileState(NAMES[0]));
        assertNull(result.fileState(NAMES[1]));
        assertNull(result.fileState("not-in-the-model"));
    }

    @Test
    public void rejectsAMarkerWhoseChecksumDoesNotMatchItsBody() throws IOException {
        assertTrue(verify().isOk());
        String text = read(marker());
        int checksumStart = text.lastIndexOf("checksum=") + "checksum=".length();
        char replacement = text.charAt(checksumStart) == '0' ? '1' : '0';
        String corrupted = text.substring(0, checksumStart)
                + replacement
                + text.substring(checksumStart + 1);
        writeRaw(marker(), corrupted.getBytes(StandardCharsets.US_ASCII));

        assertNull(ParakeetModelIntegrity.VerifiedState.read(marker()));
        ParakeetModelIntegrity.Result result = verify();

        assertTrue(result.isOk());
        assertFalse(result.markerAccepted());
        assertEquals(2, result.filesHashed());
    }

    @Test
    public void rejectsAMarkerWithoutATrailingNewline() throws IOException {
        assertTrue(verify().isOk());
        String text = read(marker());
        writeRaw(marker(), text.substring(0, text.length() - 1).getBytes(StandardCharsets.US_ASCII));

        assertNull(ParakeetModelIntegrity.VerifiedState.read(marker()));
        assertFalse(verify().markerAccepted());
    }

    @Test
    public void rejectsAnUnknownFormatVersion() throws IOException {
        writeSignedMarker(
                "format=2",
                "model=" + VERSION,
                "files=2",
                markerLine(NAMES[0]),
                markerLine(NAMES[1]));

        assertNull(ParakeetModelIntegrity.VerifiedState.read(marker()));
        assertFalse(verify().markerAccepted());
    }

    @Test
    public void rejectsAFileCountThatDoesNotMatchTheBody() throws IOException {
        writeSignedMarker(
                "format=1",
                "model=" + VERSION,
                "files=3",
                markerLine(NAMES[0]),
                markerLine(NAMES[1]));

        assertNull(ParakeetModelIntegrity.VerifiedState.read(marker()));
    }

    @Test
    public void rejectsDuplicateFileEntries() throws IOException {
        writeSignedMarker(
                "format=1",
                "model=" + VERSION,
                "files=2",
                markerLine(NAMES[0]),
                markerLine(NAMES[0]));

        assertNull(ParakeetModelIntegrity.VerifiedState.read(marker()));
    }

    @Test
    public void rejectsANegativeSize() throws IOException {
        writeSignedMarker(
                "format=1",
                "model=" + VERSION,
                "files=2",
                NAMES[0] + "|-1|0|" + digests[0],
                markerLine(NAMES[1]));

        assertNull(ParakeetModelIntegrity.VerifiedState.read(marker()));
    }

    @Test
    public void rejectsAnUppercaseDigest() throws IOException {
        writeSignedMarker(
                "format=1",
                "model=" + VERSION,
                "files=2",
                NAMES[0] + "|" + SIZES[0] + "|" + file(NAMES[0]).lastModified()
                        + "|" + digests[0].toUpperCase(),
                markerLine(NAMES[1]));

        assertNull(ParakeetModelIntegrity.VerifiedState.read(marker()));
    }

    @Test
    public void rejectsAnOversizedMarker() throws IOException {
        byte[] oversized = new byte[70 * 1024];
        Arrays.fill(oversized, (byte) 'a');
        oversized[oversized.length - 1] = '\n';
        writeRaw(marker(), oversized);

        assertNull(ParakeetModelIntegrity.VerifiedState.read(marker()));
    }

    @Test
    public void rejectsAMarkerForAnotherFileSetEvenWhenItIsWellFormed() throws IOException {
        assertTrue(verify().isOk());
        File other = writeAt("other.bin", new byte[] {1, 2, 3});
        ParakeetModelIntegrity.FileState otherState = new ParakeetModelIntegrity.FileState(
                other.getName(), other.length(), other.lastModified(),
                ParakeetModelIntegrity.sha256(other));
        ParakeetModelIntegrity.VerifiedState.of(
                VERSION, Collections.singletonList(otherState)).write(marker());

        ParakeetModelIntegrity.Result result = verify();

        assertTrue(result.isOk());
        assertFalse("a marker for another file set is not trusted", result.markerAccepted());
        assertEquals(2, result.filesHashed());
    }

    @Test
    public void writesAMarkerIntoANewDirectory() throws IOException {
        File nested = new File(new File(directory, "one"), "two");
        File target = new File(nested, ParakeetModelIntegrity.MARKER_FILE_NAME);
        ParakeetModelIntegrity.VerifiedState.of(
                VERSION,
                Arrays.asList(state(NAMES[0]), state(NAMES[1]))).write(target);

        assertTrue(nested.isDirectory());
        ParakeetModelIntegrity.VerifiedState parsed =
                ParakeetModelIntegrity.VerifiedState.read(target);
        assertNotNull(parsed);
        assertEquals(VERSION, parsed.modelVersion());
        assertEquals(2, parsed.files().size());
    }

    @Test
    public void readReturnsNullForMissingOrNonFileMarkers() throws IOException {
        assertNull(ParakeetModelIntegrity.VerifiedState.read(null));
        assertNull(ParakeetModelIntegrity.VerifiedState.read(
                new File(directory, ParakeetModelIntegrity.MARKER_FILE_NAME)));
        assertNull(ParakeetModelIntegrity.VerifiedState.read(directory));
    }

    private static void assertInvalid(ParakeetModelIntegrity.Result result) {
        assertFalse(result.isOk());
        assertEquals(ParakeetModelIntegrity.Status.CORRUPT, result.status());
        assertEquals("invalid-arguments", result.reason());
        assertEquals(0, result.filesHashed());
    }

    private ParakeetModelIntegrity.Result verify() {
        return ParakeetModelIntegrity.verify(directory, VERSION, NAMES, SIZES, digests);
    }

    private ParakeetModelIntegrity.FileState state(String name) throws IOException {
        File file = file(name);
        return new ParakeetModelIntegrity.FileState(
                name, file.length(), file.lastModified(),
                ParakeetModelIntegrity.sha256(file));
    }

    private String markerLine(String name) throws IOException {
        return markerLine(name, digests[Arrays.asList(NAMES).indexOf(name)]);
    }

    private String markerLine(String name, String digest) {
        File file = file(name);
        return name + "|" + file.length() + "|" + file.lastModified() + "|" + digest;
    }

    private void writeSignedMarker(String... headerAndFileLines) throws IOException {
        StringBuilder body = new StringBuilder();
        body.append(MARKER_MAGIC).append('\n');
        for (String line : headerAndFileLines) {
            body.append(line).append('\n');
        }
        String content = body
                + "checksum=" + sha256Hex(body.toString()) + "\n";
        writeRaw(marker(), content.getBytes(StandardCharsets.US_ASCII));
    }

    private File marker() {
        return new File(directory, ParakeetModelIntegrity.MARKER_FILE_NAME);
    }

    private File file(String name) {
        return new File(directory, name);
    }

    private File writeAt(String name, byte[] content) throws IOException {
        File file = new File(directory, name);
        write(file, content);
        return file;
    }

    private static void write(File file, byte[] content) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(content);
        }
    }

    private static void writeRaw(File file, byte[] content) throws IOException {
        write(file, content);
    }

    private static String read(File file) throws IOException {
        try (InputStream input = new FileInputStream(file)) {
            StringBuilder text = new StringBuilder();
            byte[] buffer = new byte[1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                text.append(new String(buffer, 0, read, StandardCharsets.US_ASCII));
            }
            return text.toString();
        }
    }

    private static String sha256Hex(String text) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                    .digest(text.getBytes(StandardCharsets.US_ASCII));
            StringBuilder hex = new StringBuilder(bytes.length * 2);
            for (byte value : bytes) {
                hex.append(Character.forDigit((value >> 4) & 0xf, 16));
                hex.append(Character.forDigit(value & 0xf, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new AssertionError(impossible);
        }
    }

    private static byte[] syntheticBytes(int length, int seed) {
        byte[] bytes = new byte[length];
        for (int index = 0; index < length; index++) {
            bytes[index] = (byte) ((index * 41 + seed) & 0xff);
        }
        return bytes;
    }
}
