package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * JVM coverage for the Kokoro asset digest check.
 *
 * <p>These use synthetic files only: the live 92 MB model is never read or
 * modified. They pin the behaviour the engine relies on — a matching file is
 * reused, while a same-size tampered, truncated or missing file is rejected so
 * it is re-copied or reported instead of being loaded.
 */
public class KokoroAssetIntegrityTest {

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private static final String ABC_SHA256 =
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    private static File write(File directory, String name, byte[] bytes) throws IOException {
        File file = new File(directory, name);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
        }
        return file;
    }

    @Test
    public void hashesKnownContent() throws IOException {
        File file = write(folder.getRoot(), "abc.bin", "abc".getBytes(StandardCharsets.US_ASCII));
        assertEquals(ABC_SHA256, KokoroAssetIntegrity.sha256(file));
    }

    @Test
    public void acceptsAFileWithTheExpectedSizeAndDigest() throws IOException {
        byte[] bytes = "abc".getBytes(StandardCharsets.US_ASCII);
        File file = write(folder.getRoot(), "good.bin", bytes);
        assertTrue(KokoroAssetIntegrity.matches(file, bytes.length, ABC_SHA256));
    }

    @Test
    public void rejectsASameSizeFileWithDifferentBytes() throws IOException {
        byte[] bytes = "abd".getBytes(StandardCharsets.US_ASCII);
        File file = write(folder.getRoot(), "tampered.bin", bytes);
        assertFalse("same size must not be treated as valid",
                KokoroAssetIntegrity.matches(file, bytes.length, ABC_SHA256));
    }

    @Test
    public void rejectsATruncatedFile() throws IOException {
        byte[] bytes = "ab".getBytes(StandardCharsets.US_ASCII);
        File file = write(folder.getRoot(), "short.bin", bytes);
        assertFalse(KokoroAssetIntegrity.matches(file, 3L, ABC_SHA256));
    }

    @Test
    public void rejectsAMissingFile() {
        assertFalse(KokoroAssetIntegrity.matches(new File(folder.getRoot(), "missing.bin"), 3L, ABC_SHA256));
    }

    @Test
    public void rejectsAFileWithTheWrongSizeEvenWhenTheDigestIsIgnored() throws IOException {
        byte[] bytes = "abcd".getBytes(StandardCharsets.US_ASCII);
        File file = write(folder.getRoot(), "long.bin", bytes);
        assertFalse(KokoroAssetIntegrity.matches(file, 3L, ABC_SHA256));
    }
}
