package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Synthetic tests for crash-safe asset materialisation.
 *
 * <p>The assets are a few dozen synthetic bytes, never the real ~670 MB model.
 * The tests cover copy, digest and length verification, atomic replacement,
 * interrupted copies and cleanup of corrupt material.
 */
public class ParakeetModelInstallerTest {

    private static final String VERSION = "synthetic-installer-v1";
    private static final String[] NAMES = {"encoder.bin", "decoder.bin"};
    private static final long[] SIZES = {16L, 8L};

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private File directory;
    private byte[][] contents;
    private String[] digests;

    @Before
    public void setUp() throws IOException {
        directory = temporaryFolder.newFolder("model");
        contents = new byte[][] {
            syntheticBytes(16, 3),
            syntheticBytes(8, 7),
        };
        digests = new String[NAMES.length];
        File expected = temporaryFolder.newFolder("expected");
        for (int index = 0; index < NAMES.length; index++) {
            File file = new File(expected, NAMES[index]);
            write(file, contents[index]);
            digests[index] = ParakeetModelIntegrity.sha256(file);
        }
    }

    @Test
    public void installsValidAssetsAndWritesTheMarker() throws IOException {
        ParakeetModelIntegrity.Result missing = verify();
        assertEquals(ParakeetModelIntegrity.Status.MISSING, missing.status());

        install(missing, sourceFor(contents));

        assertArrayEquals(contents[0], read(file(NAMES[0])));
        assertArrayEquals(contents[1], read(file(NAMES[1])));
        assertFalse(part(NAMES[0]).exists());

        ParakeetModelIntegrity.Result after = verify();
        assertTrue(after.isOk());
        assertTrue("the installer writes a marker the next start can trust",
                after.markerAccepted());
        assertEquals(0, after.filesHashed());
    }

    @Test
    public void repairsOnlyTheFileThatFailedVerification() throws IOException {
        install(verify(), sourceFor(contents));
        byte[] tampered = contents[1].clone();
        tampered[0] ^= 0x21;
        write(file(NAMES[1]), tampered);
        file(NAMES[1]).setLastModified(file(NAMES[1]).lastModified() + 2_000L);

        ParakeetModelIntegrity.Result verification = verify();
        assertFalse(verification.isOk());

        final List<String> opened = new ArrayList<>();
        install(verification, fileName -> {
            opened.add(fileName);
            return new ByteArrayInputStream(contents[indexOf(fileName)]);
        });

        assertEquals("the verified file is not read again",
                Arrays.asList(NAMES[1]), opened);
        assertArrayEquals(contents[1], read(file(NAMES[1])));
        assertTrue(verify().isOk());
    }

    @Test
    public void doesNotOpenAssetsWhenEverythingIsAlreadyVerified() throws IOException {
        install(verify(), sourceFor(contents));
        ParakeetModelIntegrity.Result verified = verify();
        assertTrue(verified.isOk());

        install(verified, fileName -> {
            throw new IOException("must not open " + fileName);
        });

        assertTrue(verify().isOk());
    }

    @Test
    public void interruptedCopyLeavesNoPartialFileAtTheFinalPath() throws IOException {
        ParakeetModelInstaller.AssetSource failingSource = fileName -> new InputStream() {
            private int served;

            @Override
            public int read() throws IOException {
                if (served < 5) {
                    served++;
                    return 0x7a;
                }
                throw new IOException("synthetic interrupted asset");
            }
        };

        try {
            install(verify(), failingSource);
            fail("an interrupted copy must fail closed");
        } catch (ParakeetModelInstaller.InstallException expected) {
            assertTrue(expected.reason(),
                    expected.reason().startsWith("copy-failed:" + NAMES[0]));
        }

        assertFalse("no partial file is left at the final path",
                file(NAMES[0]).exists());
        assertFalse("the temporary copy is removed", part(NAMES[0]).exists());
    }

    @Test
    public void rejectsASameSizeAssetWithTheWrongDigest() throws IOException {
        byte[] wrong = new byte[contents[0].length];
        Arrays.fill(wrong, (byte) 0x42);
        byte[][] payloads = {wrong, contents[1]};

        try {
            install(verify(), sourceFor(payloads));
            fail("a wrong digest must fail closed");
        } catch (ParakeetModelInstaller.InstallException expected) {
            assertTrue(expected.reason(),
                    expected.reason().startsWith("asset-sha256-mismatch:" + NAMES[0]));
        }

        assertFalse(file(NAMES[0]).exists());
        assertFalse(part(NAMES[0]).exists());
    }

    @Test
    public void rejectsATruncatedAsset() throws IOException {
        byte[][] payloads = {Arrays.copyOf(contents[0], 10), contents[1]};

        try {
            install(verify(), sourceFor(payloads));
            fail("a truncated asset must fail closed");
        } catch (ParakeetModelInstaller.InstallException expected) {
            assertTrue(expected.reason(),
                    expected.reason().startsWith("asset-size-mismatch:" + NAMES[0]));
        }

        assertFalse(file(NAMES[0]).exists());
        assertFalse(part(NAMES[0]).exists());
    }

    @Test
    public void removesAStaleTemporaryFileBeforeCopying() throws IOException {
        write(part(NAMES[0]), "stale partial bytes".getBytes("US-ASCII"));

        install(verify(), sourceFor(contents));

        assertFalse(part(NAMES[0]).exists());
        assertArrayEquals(contents[0], read(file(NAMES[0])));
    }

    @Test
    public void deleteModelFilesRemovesFilesMarkerAndTemporaryCopies() throws IOException {
        install(verify(), sourceFor(contents));
        write(part(NAMES[0]), new byte[] {1, 2, 3});

        ParakeetModelInstaller.deleteModelFiles(directory, NAMES);

        for (String name : NAMES) {
            assertFalse(file(name).exists());
            assertFalse(part(name).exists());
        }
        assertFalse(new File(directory, ParakeetModelIntegrity.MARKER_FILE_NAME).exists());
    }

    @Test
    public void installsEveryFileWhenNoVerificationIsAvailable() throws IOException {
        install(null, sourceFor(contents));

        assertArrayEquals(contents[0], read(file(NAMES[0])));
        assertArrayEquals(contents[1], read(file(NAMES[1])));
        ParakeetModelIntegrity.Result after = verify();
        assertTrue(after.isOk());
        assertTrue(after.markerAccepted());
    }

    @Test
    public void createsTheModelDirectoryOnFirstInstall() throws IOException {
        File nested = new File(temporaryFolder.getRoot(), "nested/model");

        ParakeetModelInstaller.install(
                nested, null, VERSION, NAMES, SIZES, digests, sourceFor(contents));

        assertTrue(nested.isDirectory());
        assertTrue(ParakeetModelIntegrity.verify(
                nested, VERSION, NAMES, SIZES, digests).isOk());
    }

    @Test
    public void rejectsInvalidArguments() {
        assertInvalid(null, VERSION, NAMES, SIZES, digests, sourceFor(contents));
        assertInvalid(directory, null, NAMES, SIZES, digests, sourceFor(contents));
        assertInvalid(directory, VERSION, null, SIZES, digests, sourceFor(contents));
        assertInvalid(directory, VERSION, NAMES, null, digests, sourceFor(contents));
        assertInvalid(directory, VERSION, NAMES, SIZES, null, sourceFor(contents));
        assertInvalid(directory, VERSION, NAMES, SIZES, digests, null);
        assertInvalid(directory, VERSION, new String[0], new long[0], new String[0],
                sourceFor(contents));
        assertInvalid(directory, VERSION, NAMES, new long[] {16L}, digests,
                sourceFor(contents));
    }

    @Test
    public void failedRepairRemovesTheCorruptFinalFileAndLeavesNoTrustedMarker() throws IOException {
        install(verify(), sourceFor(contents));
        byte[] tampered = contents[1].clone();
        tampered[0] ^= 0x11;
        write(file(NAMES[1]), tampered);
        file(NAMES[1]).setLastModified(file(NAMES[1]).lastModified() + 2_000L);
        ParakeetModelIntegrity.Result verification = verify();
        assertFalse(verification.isOk());

        try {
            install(verification, fileName -> {
                throw new IOException("asset unavailable");
            });
            fail("a failed repair must not report success");
        } catch (ParakeetModelInstaller.InstallException expected) {
            assertTrue(expected.reason(),
                    expected.reason().startsWith("copy-failed:" + NAMES[1]));
        }

        assertFalse("the unverified final file is removed", file(NAMES[1]).exists());
        assertFalse(part(NAMES[1]).exists());
        ParakeetModelIntegrity.Result after = verify();
        assertFalse(after.isOk());
        assertEquals(ParakeetModelIntegrity.Status.CORRUPT, after.status());
        assertTrue(after.reason(), after.reason().startsWith("missing:" + NAMES[1]));
        assertFalse("the marker from the previous install is not trusted",
                after.markerAccepted());
    }

    @Test
    public void refusesAStaleTemporaryPathThatIsADirectory() throws IOException {
        File blockedTemp = part(NAMES[0]);
        assertTrue(blockedTemp.mkdir());
        write(new File(blockedTemp, "occupied"), new byte[] {1});

        try {
            install(verify(), sourceFor(contents));
            fail("a temporary path that cannot be cleared must fail closed");
        } catch (ParakeetModelInstaller.InstallException expected) {
            assertEquals("cannot-remove-stale-temp:" + NAMES[0], expected.reason());
        }

        assertFalse("no final file is created after the failed clean-up",
                file(NAMES[0]).exists());
    }

    @Test
    public void deleteModelFilesToleratesMissingArguments() throws IOException {
        ParakeetModelInstaller.deleteModelFiles(null, NAMES);

        install(verify(), sourceFor(contents));
        ParakeetModelInstaller.deleteModelFiles(directory, null);

        assertFalse("a null name list still removes the marker",
                new File(directory, ParakeetModelIntegrity.MARKER_FILE_NAME).exists());
        assertTrue("a null name list does not remove model files", file(NAMES[0]).exists());
        assertTrue(file(NAMES[1]).exists());
    }

    private void assertInvalid(
            File targetDirectory,
            String version,
            String[] names,
            long[] sizes,
            String[] expectedDigests,
            ParakeetModelInstaller.AssetSource assetSource) {
        try {
            ParakeetModelInstaller.install(
                    targetDirectory, null, version, names, sizes, expectedDigests, assetSource);
            fail("invalid arguments must be rejected");
        } catch (IOException expected) {
            assertTrue(expected instanceof ParakeetModelInstaller.InstallException);
            assertEquals("invalid-arguments",
                    ((ParakeetModelInstaller.InstallException) expected).reason());
        }
    }

    private ParakeetModelIntegrity.Result verify() {
        return ParakeetModelIntegrity.verify(directory, VERSION, NAMES, SIZES, digests);
    }

    private void install(
            ParakeetModelIntegrity.Result verification,
            ParakeetModelInstaller.AssetSource source) throws IOException {
        ParakeetModelInstaller.install(
                directory, verification, VERSION, NAMES, SIZES, digests, source);
    }

    private ParakeetModelInstaller.AssetSource sourceFor(byte[][] payloads) {
        return fileName -> new ByteArrayInputStream(payloads[indexOf(fileName)]);
    }

    private static int indexOf(String fileName) {
        for (int index = 0; index < NAMES.length; index++) {
            if (NAMES[index].equals(fileName)) {
                return index;
            }
        }
        throw new IllegalArgumentException(fileName);
    }

    private File file(String name) {
        return new File(directory, name);
    }

    private File part(String name) {
        return new File(directory, name + ParakeetModelInstaller.TEMP_SUFFIX);
    }

    private static void write(File file, byte[] content) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(content);
        }
    }

    private static byte[] read(File file) throws IOException {
        try (InputStream input = new FileInputStream(file);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private static byte[] syntheticBytes(int length, int seed) {
        byte[] bytes = new byte[length];
        for (int index = 0; index < length; index++) {
            bytes[index] = (byte) ((index * 37 + seed) & 0xff);
        }
        return bytes;
    }
}
