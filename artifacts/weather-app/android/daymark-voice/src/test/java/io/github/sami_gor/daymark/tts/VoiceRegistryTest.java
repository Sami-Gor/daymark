package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class VoiceRegistryTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private File dir() throws Exception {
        return tmp.newFolder("kokoro");
    }

    private void write(File dir, String voice, byte[] bytes) throws Exception {
        Files.write(new File(dir, voice + ".bin").toPath(), bytes);
    }

    @Test
    public void onlyTheThreeDocumentedVoicesAreSupported() {
        assertTrue(VoiceRegistry.isSupported("bm_fable"));
        assertTrue(VoiceRegistry.isSupported("ff_siwis"));
        assertTrue(VoiceRegistry.isSupported("em_alex"));
        assertFalse(VoiceRegistry.isSupported("bm_george"));
        assertFalse(VoiceRegistry.isSupported(null));
        assertFalse(VoiceRegistry.isSupported("../escape"));
    }

    @Test
    public void installedVoicesAreDetectedWithDeterministicOrder() throws Exception {
        File dir = dir();
        write(dir, "em_alex", new byte[]{1, 2, 3});
        write(dir, "ff_siwis", new byte[]{1});
        assertEquals("[ff_siwis, em_alex]", VoiceRegistry.installed(dir).toString());
    }

    @Test
    public void englishIsOnlyInstalledWhenItsFileExists() throws Exception {
        File dir = dir();
        assertTrue(VoiceRegistry.installed(dir).isEmpty());
        assertFalse(VoiceRegistry.isInstalled(dir, VoiceRegistry.ENGLISH));
        write(dir, "bm_fable", new byte[]{9});
        assertTrue(VoiceRegistry.isInstalled(dir, VoiceRegistry.ENGLISH));
    }

    @Test
    public void missingAndEmptyVoiceFilesReportDistinctReasons() throws Exception {
        File dir = dir();
        assertEquals("voice-not-installed", VoiceRegistry.unavailableReason(dir, "ff_siwis"));
        write(dir, "ff_siwis", new byte[0]);
        assertEquals("voice-corrupt", VoiceRegistry.unavailableReason(dir, "ff_siwis"));
        write(dir, "ff_siwis", new byte[]{1});
        assertNull(VoiceRegistry.unavailableReason(dir, "ff_siwis"));
        assertEquals("unsupported-voice", VoiceRegistry.unavailableReason(dir, "bm_george"));
    }

    @Test
    public void pathResolutionCannotEscapeTheVoicesDirectory() throws Exception {
        File dir = dir();
        assertNull(VoiceRegistry.fileFor(dir, "../outside"));
        assertNull(VoiceRegistry.fileFor(null, "ff_siwis"));
        assertNotNull(VoiceRegistry.fileFor(dir, "ff_siwis"));
    }

    @Test
    public void newlyInstalledComparesAgainstTheLoadedSet() throws Exception {
        File dir = dir();
        write(dir, "bm_fable", new byte[]{1});
        write(dir, "ff_siwis", new byte[]{2});
        assertEquals("[ff_siwis]",
                VoiceRegistry.newlyInstalled(dir, java.util.Collections.singleton("bm_fable")).toString());
        assertTrue(VoiceRegistry.newlyInstalled(
                dir, new java.util.HashSet<>(java.util.Arrays.asList("bm_fable", "ff_siwis"))).isEmpty());
    }

    @Test
    public void unsupportedFileNamesAreNotLoaded() throws Exception {
        File dir = dir();
        Files.write(new File(dir, "secret.bin").toPath(),
                "not-a-voice".getBytes(StandardCharsets.UTF_8));
        assertTrue(VoiceRegistry.installed(dir).isEmpty());
    }
}
