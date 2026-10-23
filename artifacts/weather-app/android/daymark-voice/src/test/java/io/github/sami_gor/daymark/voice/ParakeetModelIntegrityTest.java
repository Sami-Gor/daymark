package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import org.junit.Assume;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Synthetic tests for streamed model verification and the verification marker.
 *
 * <p>Every file here is a few dozen synthetic bytes. These tests never read or
 * hash the real ~670 MB Parakeet model, so they stay fast enough for the normal
 * unit-test task.
 */
public class ParakeetModelIntegrityTest {

    private static final String VERSION = "synthetic-model-v1";
    private static final String[] NAMES = {"encoder.bin", "decoder.bin", "tokens.txt"};
    private static final long[] SIZES = {64L, 32L, 12L};

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private File directory;
    private byte[][] contents;
    private String[] digests;

    @Before
    public void setUp() throws IOException {
        directory = temporaryFolder.newFolder("model");
        contents = new byte[][] {
            syntheticBytes(64, 17),
            syntheticBytes(32, 29),
            "hello world\n".getBytes(StandardCharsets.US_ASCII),
        };
        digests = new String[NAMES.length];
        for (int index = 0; index < NAMES.length; index++) {
            write(NAMES[index], contents[index]);
            digests[index] = ParakeetModelIntegrity.sha256(file(NAMES[index]));
        }
    }

    @Test
    public void acceptsValidSyntheticFilesAndWritesTheMarker() throws IOException {
        ParakeetModelIntegrity.Result result = verify();

        assertTrue(result.isOk());
        assertFalse(result.markerAccepted());
        assertEquals(3, result.filesHashed());
        assertTrue(marker().isFile());
        assertFalse(new File(directory,
                ParakeetModelIntegrity.MARKER_FILE_NAME + ".tmp").exists());
        assertNotNull(ParakeetModelIntegrity.VerifiedState.read(marker()));
    }

    @Test
    public void markerFastPathSkipsHashingWhenNothingChanged() {
        assertTrue(verify().isOk());

        ParakeetModelIntegrity.Result second = verify();

        assertTrue(second.isOk());
        assertTrue("an unchanged install uses the marker", second.markerAccepted());
        assertEquals("no file is hashed on the fast path", 0, second.filesHashed());
    }

    @Test
    public void detectsSameSizeTampering() {
        assertTrue(verify().isOk());
        byte[] tampered = contents[0].clone();
        tampered[0] ^= 0x5a;
        writeUnchecked(NAMES[0], tampered);
        // Make sure the marker is invalidated by the mtime as well; the digest
        // must then catch content that still has the pinned length.
        file(NAMES[0]).setLastModified(file(NAMES[0]).lastModified() + 2_000L);

        ParakeetModelIntegrity.Result result = verify();

        assertFalse(result.isOk());
        assertEquals(ParakeetModelIntegrity.Status.CORRUPT, result.status());
        assertFalse(result.markerAccepted());
        assertTrue(result.reason(),
                result.reason().startsWith("sha256-mismatch:" + NAMES[0]));
    }

    @Test
    public void detectsATruncatedFile() {
        writeUnchecked(NAMES[0], Arrays.copyOf(contents[0], 10));

        ParakeetModelIntegrity.Result result = verify();

        assertFalse(result.isOk());
        assertTrue(result.reason(),
                result.reason().startsWith("size-mismatch:" + NAMES[0]));
    }

    @Test
    public void detectsAZeroLengthFile() {
        writeUnchecked(NAMES[1], new byte[0]);

        ParakeetModelIntegrity.Result result = verify();

        assertFalse(result.isOk());
        assertTrue(result.reason(), result.reason().startsWith("empty:" + NAMES[1]));
    }

    @Test
    public void detectsAMissingFileEvenWithAValidMarker() {
        assertTrue(verify().isOk());
        assertTrue(file(NAMES[1]).delete());

        ParakeetModelIntegrity.Result result = verify();

        assertFalse(result.isOk());
        assertEquals(ParakeetModelIntegrity.Status.CORRUPT, result.status());
        assertTrue(result.reason(), result.reason().startsWith("missing:" + NAMES[1]));
    }

    @Test
    public void reportsMissingWhenNothingHasBeenMaterialisedYet() throws IOException {
        File empty = temporaryFolder.newFolder("empty-model");

        ParakeetModelIntegrity.Result result = ParakeetModelIntegrity.verify(
                empty, VERSION, NAMES, SIZES, digests);

        assertFalse(result.isOk());
        assertEquals(ParakeetModelIntegrity.Status.MISSING, result.status());
        assertEquals(0, result.filesHashed());
        assertTrue(result.reason(), result.reason().startsWith("missing:" + NAMES[0]));
    }

    @Test
    public void treatsAnUnreadableFileAsCorrupt() {
        assertTrue(verify().isOk());
        File unreadable = file(NAMES[0]);
        Assume.assumeTrue("requires POSIX file permissions", unreadable.setReadable(false, false));
        Assume.assumeFalse("the test user can still read the file", unreadable.canRead());
        try {
            ParakeetModelIntegrity.Result result = verify();

            assertFalse(result.isOk());
            assertTrue(result.reason(),
                    result.reason().startsWith("unreadable:" + NAMES[0]));
        } finally {
            unreadable.setReadable(true, false);
        }
    }

    @Test
    public void malformedMarkerForcesAFullRehashAndIsReplaced() throws IOException {
        assertTrue(verify().isOk());
        writeRaw(marker(), "this is not a marker\n".getBytes(StandardCharsets.US_ASCII));

        ParakeetModelIntegrity.Result result = verify();

        assertTrue(result.isOk());
        assertFalse(result.markerAccepted());
        assertEquals(3, result.filesHashed());
        assertNotNull("a valid marker is written again",
                ParakeetModelIntegrity.VerifiedState.read(marker()));
    }

    @Test
    public void staleMarkerWithAWrongDigestNeverHidesCorruption() throws IOException {
        assertTrue(verify().isOk());
        byte[] corrupted = contents[0].clone();
        corrupted[0] ^= 0x33;
        writeUnchecked(NAMES[0], corrupted);

        // A marker that is internally consistent (valid checksum, matching size
        // and mtime) but whose digest is not the pinned digest must still be
        // rejected before the files are trusted.
        File forgedMarker = marker();
        ParakeetModelIntegrity.VerifiedState forged = ParakeetModelIntegrity.VerifiedState.of(
                VERSION,
                Arrays.asList(
                        state(NAMES[0]),
                        state(NAMES[1]),
                        state(NAMES[2])));
        forged.write(forgedMarker);

        ParakeetModelIntegrity.Result result = verify();

        assertFalse(result.markerAccepted());
        assertFalse(result.isOk());
        assertTrue(result.reason(),
                result.reason().startsWith("sha256-mismatch:" + NAMES[0]));
    }

    @Test
    public void markerIsInvalidatedByASizeChange() {
        assertTrue(verify().isOk());
        byte[] grown = Arrays.copyOf(contents[1], contents[1].length + 1);
        writeUnchecked(NAMES[1], grown);

        ParakeetModelIntegrity.Result result = verify();

        assertFalse(result.isOk());
        assertFalse(result.markerAccepted());
        assertTrue(result.filesHashed() > 0);
        assertTrue(result.reason(),
                result.reason().startsWith("size-mismatch:" + NAMES[1]));
    }

    @Test
    public void markerIsInvalidatedByAnMtimeChangeEvenWhenContentIsValid() {
        assertTrue(verify().isOk());
        File file = file(NAMES[2]);
        assertTrue(file.setLastModified(file.lastModified() + 2_000L));

        ParakeetModelIntegrity.Result result = verify();

        assertTrue(result.isOk());
        assertFalse(result.markerAccepted());
        assertEquals("all files are re-hashed", 3, result.filesHashed());

        ParakeetModelIntegrity.Result refreshed = verify();
        assertTrue(refreshed.markerAccepted());
        assertEquals(0, refreshed.filesHashed());
    }

    @Test
    public void markerForAnotherModelVersionIsRejected() {
        assertTrue(verify().isOk());

        ParakeetModelIntegrity.Result result = ParakeetModelIntegrity.verify(
                directory, VERSION + "-next", NAMES, SIZES, digests);

        assertTrue(result.isOk());
        assertFalse("a marker from another model version is stale",
                result.markerAccepted());
        assertEquals(3, result.filesHashed());
        assertEquals(VERSION + "-next",
                ParakeetModelIntegrity.VerifiedState.read(marker()).modelVersion());
    }

    @Test
    public void sha256MatchesThePublishedTestVector() throws IOException {
        File file = writeAt("abc.txt", "abc".getBytes(StandardCharsets.US_ASCII));

        assertEquals(
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                ParakeetModelIntegrity.sha256(file));
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

    private File file(String name) {
        return new File(directory, name);
    }

    private File marker() {
        return new File(directory, ParakeetModelIntegrity.MARKER_FILE_NAME);
    }

    private void write(String name, byte[] content) throws IOException {
        writeAt(name, content);
    }

    private File writeAt(String name, byte[] content) throws IOException {
        File file = new File(directory, name);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(content);
        }
        return file;
    }

    private void writeUnchecked(String name, byte[] content) {
        try {
            write(name, content);
        } catch (IOException impossible) {
            throw new AssertionError(impossible);
        }
    }

    private static void writeRaw(File file, byte[] content) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(content);
        }
    }

    private static byte[] syntheticBytes(int length, int seed) {
        byte[] bytes = new byte[length];
        for (int index = 0; index < length; index++) {
            bytes[index] = (byte) ((index * 31 + seed) & 0xff);
        }
        return bytes;
    }
}
