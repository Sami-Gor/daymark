package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * P0 storage-preflight fault injection for the Parakeet first-run install.
 *
 * <p>Every buffer here is a few KiB of synthetic bytes. The 652 MB encoder is
 * never materialised: the fault paths only need a payload that spans more than
 * one {@link ParakeetModelIntegrity#BUFFER_SIZE} write, which the 192 KiB
 * synthetic "encoder" does.
 *
 * <p>Covered: the preflight threshold for the pinned model (insufficient space
 * before any copy), an ENOSPC-class failure part-way through a copy, a
 * truncated copy, an interrupted {@code .part} left by a crash, a corrupt
 * digest, preservation of an already-verified model, the marker being written
 * only after every file succeeds, and recovery once the condition is removed.
 *
 * <p>Limitation: {@link ParakeetModelInstaller} constructs its
 * {@link FileOutputStream} internally, so a genuine write-side ENOSPC cannot be
 * injected without a production seam (an output-stream factory). The fault is
 * therefore injected through the asset {@link InputStream} after the same
 * number of bytes; it travels the identical catch, temp-cleanup and
 * classification path. Write-side ENOSPC and real disk-full behaviour still
 * need an emulator or a device.
 */
public class ParakeetStorageFaultInjectionTest {

    private static final String VERSION = "synthetic-storage-fault-v1";
    private static final String[] NAMES = {"encoder.int8.onnx", "tokens.txt"};
    private static final int ENCODER_BYTES = 3 * ParakeetModelIntegrity.BUFFER_SIZE;
    /** Bytes the failing source serves before it raises the storage fault. */
    private static final int SERVED_BEFORE_FAILURE = 100_000;

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private File directory;
    private byte[][] contents;
    private long[] sizes;
    private String[] digests;

    @Before
    public void setUp() throws IOException {
        directory = temporaryFolder.newFolder("model");
        contents = new byte[][] {
            syntheticBytes(ENCODER_BYTES, 11),
            "hello\n".getBytes(StandardCharsets.US_ASCII),
        };
        sizes = new long[] {contents[0].length, contents[1].length};
        digests = new String[] {sha256(contents[0]), sha256(contents[1])};
    }

    // ------------------------------------------------------------------
    // Insufficient space is refused before any copy starts.
    // ------------------------------------------------------------------

    @Test
    public void preflightRefusesBeforeTheInstalledBytesAreCovered() {
        long[] pinned = ParakeetModelAssets.MODEL_FILE_SIZES;
        long installed = sum(pinned);
        long staging = largest(pinned);
        long required = ModelStoragePreflight.requiredBytes(pinned);

        assertTrue("the four pinned files must be more than one staging copy",
                installed > staging);
        assertFalse("only the installed bytes are not enough",
                ModelStoragePreflight.hasRoom(installed, pinned));
        assertFalse("installed bytes plus one staging copy still leaves no margin",
                ModelStoragePreflight.hasRoom(installed + staging, pinned));
        assertFalse("one byte short must be refused",
                ModelStoragePreflight.hasRoom(required - 1L, pinned));
        assertTrue("exactly the required total is accepted",
                ModelStoragePreflight.hasRoom(required, pinned));
        assertTrue("more than the required total is accepted",
                ModelStoragePreflight.hasRoom(required + 1L, pinned));
    }

    @Test
    public void requiredBytesForThePinnedModelIsInstalledPlusStagingPlusMargin() {
        long[] pinned = ParakeetModelAssets.MODEL_FILE_SIZES;
        long installed = sum(pinned);
        long staging = largest(pinned);
        long margin = Math.max(
                ModelStoragePreflight.MIN_MARGIN_BYTES,
                installed * ModelStoragePreflight.MARGIN_PERCENT / 100L);

        // The exact total the plugin logs as "required=" before it decides.
        assertEquals(1_342_777_416L, ModelStoragePreflight.requiredBytes(pinned));
        assertEquals(installed + staging + margin, ModelStoragePreflight.requiredBytes(pinned));
        assertEquals("staging is the largest single file, not the sum",
                652_184_281L, staging);
        assertEquals("3% of ~670 MB beats the 16 MiB floor", 20_114_363L, margin);
    }

    // ------------------------------------------------------------------
    // ENOSPC part-way through a copy.
    // ------------------------------------------------------------------

    @Test
    public void enospcMidCopyLeavesNoPartialFinalFileAndNoMarker() {
        ParakeetModelInstaller.InstallException failure = installExpectingFailure(
                verify(), sourceFailingOn(NAMES[0], SERVED_BEFORE_FAILURE, enospc()));

        assertTrue(failure.reason(),
                failure.reason().startsWith("copy-failed:" + NAMES[0]));
        assertNotNull("the storage cause must be retained, not flattened",
                failure.getCause());
        assertTrue("the cause must still identify the storage fault: "
                        + failure.getCause().getMessage(),
                isEnospc(failure.getCause()));

        assertFalse("no partial file may be published at the final path",
                file(NAMES[0]).exists());
        assertFalse("the interrupted temporary copy is removed", part(NAMES[0]).exists());
        assertFalse("a failed first install writes no marker", marker().exists());

        ParakeetModelIntegrity.Result after = verify();
        assertFalse(after.isOk());
        assertEquals(ParakeetModelIntegrity.Status.MISSING, after.status());
        assertFalse(after.markerAccepted());
    }

    /**
     * Pins current behaviour, not the desired contract: the installer wraps the
     * cause in {@code copy-failed:<name>} and the plugin classifies that
     * wrapper, so a mid-copy ENOSPC is reported as a copy failure rather than
     * {@code insufficient-storage}. The web layer maps {@code copy-failed:...}
     * to its opaque {@code unknown} code. The preflight is what normally catches
     * ENOSPC; a fix would preserve the storage reason through the wrapper.
     */
    @Test
    public void midCopyEnospcIsCurrentlyReportedAsCopyFailureNotInsufficientStorage() {
        ParakeetModelInstaller.InstallException failure = installExpectingFailure(
                verify(), sourceFailingOn(NAMES[0], SERVED_BEFORE_FAILURE, enospc()));

        assertEquals("copy-failed:" + NAMES[0],
                ParakeetModelInstaller.classify(failure));
        assertNotEquals(ParakeetModelAssets.REASON_INSUFFICIENT_STORAGE,
                ParakeetModelInstaller.classify(failure));
    }

    @Test
    public void truncatedCopyMidStreamIsRejectedAndCleanedUp() {
        InputStream truncated = new ByteArrayInputStream(
                contents[0], 0, SERVED_BEFORE_FAILURE);

        ParakeetModelInstaller.InstallException failure = installExpectingFailure(
                verify(), fileName -> NAMES[0].equals(fileName)
                        ? truncated
                        : new ByteArrayInputStream(contents[1]));

        assertTrue(failure.reason(),
                failure.reason().startsWith("asset-size-mismatch:" + NAMES[0]));
        assertFalse(file(NAMES[0]).exists());
        assertFalse(part(NAMES[0]).exists());
        assertFalse(marker().exists());
    }

    // ------------------------------------------------------------------
    // Interrupted .part left by a crash.
    // ------------------------------------------------------------------

    @Test
    public void crashBeforeRenameLeavesAFullPartThatIsNeverTrusted() throws IOException {
        // A crash after the bytes were synced but before the rename: the
        // temporary file holds a complete, digest-correct copy and there is no
        // final file and no marker.
        write(part(NAMES[0]), contents[0]);

        ParakeetModelIntegrity.Result crashState = verify();
        assertFalse("a .part must never satisfy verification", crashState.isOk());
        assertEquals(ParakeetModelIntegrity.Status.MISSING, crashState.status());
        assertFalse(crashState.markerAccepted());

        install(crashState, sourceFor(contents));

        assertFalse(part(NAMES[0]).exists());
        assertArrayEquals(contents[0], read(file(NAMES[0])));
        assertTrue(verify().isOk());
    }

    @Test
    public void garbagePartIsReplacedByAVerifiedCopy() throws IOException {
        write(part(NAMES[0]), "half-written".getBytes(StandardCharsets.US_ASCII));

        install(verify(), sourceFor(contents));

        assertFalse(part(NAMES[0]).exists());
        assertArrayEquals(contents[0], read(file(NAMES[0])));
        ParakeetModelIntegrity.Result after = verify();
        assertTrue(after.isOk());
        assertTrue(after.markerAccepted());
    }

    @Test
    public void stalePartBesideAVerifiedFinalIsHarmlessAndRemovedByTheFailurePath()
            throws IOException {
        install(verify(), sourceFor(contents));
        write(part(NAMES[0]), "leftover".getBytes(StandardCharsets.US_ASCII));
        byte[] installed = read(file(NAMES[0]));

        // A verified final is not re-read, so the stale .part is not consulted
        // at all: verification still trusts the model content.
        ParakeetModelIntegrity.Result verified = verify();
        assertTrue(verified.isOk());
        assertTrue(verified.markerAccepted());
        assertEquals(0, verified.filesHashed());

        // The next install skips the verified file before it touches the temp
        // path, so the stale .part is left for the plugin's failure cleanup.
        install(verified, fileName -> {
            throw new IOException("must not open " + fileName);
        });
        assertTrue("skipping verified files never opens the temp path",
                part(NAMES[0]).exists());
        assertArrayEquals("a stale .part never replaces verified content",
                installed, read(file(NAMES[0])));
        assertTrue(verify().isOk());

        // ParakeetSpeechRecognitionPlugin removes in-flight temporaries on any
        // install failure; finals and the marker survive that cleanup.
        ParakeetModelInstaller.deleteTemporaryFiles(directory, NAMES);
        assertFalse(part(NAMES[0]).exists());
        assertArrayEquals(installed, read(file(NAMES[0])));
        assertTrue(marker().exists());
        assertTrue(verify().isOk());
    }

    // ------------------------------------------------------------------
    // Corrupt digest and preservation of valid material.
    // ------------------------------------------------------------------

    @Test
    public void corruptDigestRemovesOnlyTheCorruptFileAndPreservesTheVerifiedOne()
            throws IOException {
        install(verify(), sourceFor(contents));
        long encoderModified = file(NAMES[0]).lastModified();
        byte[] encoderBytes = read(file(NAMES[0]));

        byte[] corruptTokens = contents[1].clone();
        corruptTokens[0] ^= 0x5a;
        write(file(NAMES[1]), corruptTokens);
        file(NAMES[1]).setLastModified(file(NAMES[1]).lastModified() + 2_000L);

        ParakeetModelIntegrity.Result corrupt = verify();
        assertFalse(corrupt.isOk());
        assertEquals(ParakeetModelIntegrity.Status.CORRUPT, corrupt.status());
        assertTrue(corrupt.reason(), corrupt.reason().startsWith("sha256-mismatch:" + NAMES[1]));
        assertFalse("the old marker must not be trusted after corruption",
                corrupt.markerAccepted());
        byte[] markerBeforeRepair = read(marker());

        // The repair fails on the corrupt file (space exhausted again).
        ParakeetModelInstaller.InstallException failure = installExpectingFailure(
                corrupt, sourceFailingOn(NAMES[1], 0, enospc()));
        assertTrue(failure.reason(),
                failure.reason().startsWith("copy-failed:" + NAMES[1]));

        assertArrayEquals("the verified file is untouched",
                encoderBytes, read(file(NAMES[0])));
        assertEquals("the verified file is not rewritten",
                encoderModified, file(NAMES[0]).lastModified());
        assertFalse("the corrupt file must not survive at a final path",
                file(NAMES[1]).exists());
        assertFalse(part(NAMES[1]).exists());
        assertArrayEquals("a failed repair does not refresh the marker",
                markerBeforeRepair, read(marker()));

        ParakeetModelIntegrity.Result after = verify();
        assertFalse(after.isOk());
        assertTrue(after.reason(), after.reason().startsWith("missing:" + NAMES[1]));
        assertFalse("the stale marker is not accepted for the incomplete model",
                after.markerAccepted());
    }

    // ------------------------------------------------------------------
    // The marker is written only after every file succeeds.
    // ------------------------------------------------------------------

    @Test
    public void markerIsOnlyWrittenAfterEveryFileInstalls() throws IOException {
        ParakeetModelInstaller.InstallException failure = installExpectingFailure(
                verify(), sourceFailingOn(NAMES[1], 0, enospc()));

        assertTrue(failure.reason(),
                failure.reason().startsWith("copy-failed:" + NAMES[1]));
        assertArrayEquals("the file that installed before the fault stays installed",
                contents[0], read(file(NAMES[0])));
        assertFalse(file(NAMES[1]).exists());
        assertFalse(part(NAMES[1]).exists());
        assertFalse("a partial install must not write the verification marker",
                marker().exists());

        ParakeetModelIntegrity.Result partial = verify();
        assertFalse(partial.isOk());
        assertEquals(ParakeetModelIntegrity.Status.CORRUPT, partial.status());

        // Once the fault is gone the retry completes and only then writes it.
        install(partial, sourceFor(contents));
        assertTrue(marker().exists());
        ParakeetModelIntegrity.Result complete = verify();
        assertTrue(complete.isOk());
        assertTrue(complete.markerAccepted());
        assertEquals(0, complete.filesHashed());
    }

    // ------------------------------------------------------------------
    // Recovery once the condition is removed.
    // ------------------------------------------------------------------

    @Test
    public void recoversAfterTheSpaceFaultIsCleared() throws IOException {
        installExpectingFailure(verify(),
                sourceFailingOn(NAMES[0], SERVED_BEFORE_FAILURE, enospc()));
        assertFalse(marker().exists());

        install(verify(), sourceFor(contents));

        assertArrayEquals(contents[0], read(file(NAMES[0])));
        assertArrayEquals(contents[1], read(file(NAMES[1])));
        assertFalse(part(NAMES[0]).exists());
        assertFalse(part(NAMES[1]).exists());

        ParakeetModelIntegrity.Result recovered = verify();
        assertTrue(recovered.isOk());
        assertTrue(recovered.markerAccepted());
        assertEquals(0, recovered.filesHashed());
    }

    @Test
    public void recoveryHappensWithoutKeepingAFailedTemporaryCopy() throws IOException {
        installExpectingFailure(verify(),
                sourceFailingOn(NAMES[0], SERVED_BEFORE_FAILURE, enospc()));
        // Even if a temporary survived a process crash instead of the catch
        // block, the retry removes it before copying.
        write(part(NAMES[0]), new byte[] {9, 9, 9});

        install(verify(), sourceFor(contents));

        assertFalse(part(NAMES[0]).exists());
        assertArrayEquals(contents[0], read(file(NAMES[0])));
        assertTrue(verify().isOk());
    }

    // ------------------------------------------------------------------
    // An already-valid model is preserved verbatim.
    // ------------------------------------------------------------------

    @Test
    public void aVerifiedModelIsNotRewrittenByARetry() throws IOException {
        install(verify(), sourceFor(contents));
        byte[] encoderBefore = read(file(NAMES[0]));
        long encoderModifiedBefore = file(NAMES[0]).lastModified();
        byte[] markerBefore = read(marker());

        ParakeetModelIntegrity.Result verified = verify();
        assertTrue(verified.isOk());
        assertTrue(verified.markerAccepted());

        // No file may be opened or re-hashed: the marker already vouches for it.
        install(verified, fileName -> {
            throw new IOException("must not open " + fileName);
        });

        assertArrayEquals(encoderBefore, read(file(NAMES[0])));
        assertEquals(encoderModifiedBefore, file(NAMES[0]).lastModified());
        assertArrayEquals("the marker content is unchanged", markerBefore, read(marker()));
        assertTrue(verify().isOk());
    }

    // ------------------------------------------------------------------
    // Helpers.
    // ------------------------------------------------------------------

    private ParakeetModelIntegrity.Result verify() {
        return ParakeetModelIntegrity.verify(directory, VERSION, NAMES, sizes, digests);
    }

    private void install(
            ParakeetModelIntegrity.Result verification,
            ParakeetModelInstaller.AssetSource source) throws IOException {
        ParakeetModelInstaller.install(
                directory, verification, VERSION, NAMES, sizes, digests, source);
    }

    private ParakeetModelInstaller.InstallException installExpectingFailure(
            ParakeetModelIntegrity.Result verification,
            ParakeetModelInstaller.AssetSource source) {
        try {
            install(verification, source);
        } catch (ParakeetModelInstaller.InstallException expected) {
            return expected;
        } catch (IOException other) {
            throw new AssertionError("expected an InstallException, got " + other, other);
        }
        fail("the install must fail closed");
        return null;
    }

    private ParakeetModelInstaller.AssetSource sourceFor(byte[][] payloads) {
        return fileName -> new ByteArrayInputStream(payloads[indexOf(fileName)]);
    }

    /** Serves one asset up to {@code servedBeforeFailure} bytes, then the fault. */
    private ParakeetModelInstaller.AssetSource sourceFailingOn(
            final String failingName,
            final int servedBeforeFailure,
            final IOException failure) {
        return fileName -> NAMES[0].equals(fileName) && !failingName.equals(fileName)
                ? new ByteArrayInputStream(contents[0])
                : NAMES[1].equals(fileName) && !failingName.equals(fileName)
                        ? new ByteArrayInputStream(contents[1])
                        : failingAfter(contents[indexOf(fileName)], servedBeforeFailure, failure);
    }

    private static InputStream failingAfter(
            final byte[] content,
            final int servedBeforeFailure,
            final IOException failure) {
        return new InputStream() {
            private int position;

            @Override
            public int read() throws IOException {
                if (position >= servedBeforeFailure) {
                    throw failure;
                }
                return content[position++] & 0xff;
            }

            @Override
            public int read(byte[] buffer, int offset, int length) throws IOException {
                if (position >= servedBeforeFailure) {
                    throw failure;
                }
                int count = Math.min(length,
                        Math.min(servedBeforeFailure - position, content.length - position));
                if (count <= 0) {
                    return -1;
                }
                System.arraycopy(content, position, buffer, offset, count);
                position += count;
                return count;
            }
        };
    }

    private static IOException enospc() {
        return new IOException("FileOutputStream.write failed: ENOSPC "
                + "(No space left on device)");
    }

    private static boolean isEnospc(Throwable failure) {
        String message = failure == null ? "" : String.valueOf(failure.getMessage());
        return message.contains("ENOSPC") || message.contains("No space left on device");
    }

    private File file(String name) {
        return new File(directory, name);
    }

    private File part(String name) {
        return new File(directory, name + ParakeetModelInstaller.TEMP_SUFFIX);
    }

    private File marker() {
        return new File(directory, ParakeetModelIntegrity.MARKER_FILE_NAME);
    }

    private static int indexOf(String fileName) {
        for (int index = 0; index < NAMES.length; index++) {
            if (NAMES[index].equals(fileName)) {
                return index;
            }
        }
        throw new IllegalArgumentException(fileName);
    }

    private static long sum(long[] values) {
        long total = 0L;
        for (long value : values) {
            total += value;
        }
        return total;
    }

    private static long largest(long[] values) {
        long largest = 0L;
        for (long value : values) {
            largest = Math.max(largest, value);
        }
        return largest;
    }

    private static void write(File file, byte[] content) throws IOException {
        try (OutputStream output = new FileOutputStream(file)) {
            output.write(content);
        }
    }

    private static byte[] read(File file) throws IOException {
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }

    private static String sha256(byte[] content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(content);
            char[] digits = "0123456789abcdef".toCharArray();
            char[] output = new char[bytes.length * 2];
            for (int index = 0; index < bytes.length; index++) {
                int value = bytes[index] & 0xff;
                output[index * 2] = digits[value >>> 4];
                output[index * 2 + 1] = digits[value & 0x0f];
            }
            return new String(output);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
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
