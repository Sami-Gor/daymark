package io.github.sami_gor.daymark.packs;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.nio.file.Files;
import java.security.KeyPair;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import io.github.sami_gor.daymark.packs.PackTestSupport.MockTransport;
import io.github.sami_gor.daymark.tts.NarrationVoicePolicy;
import io.github.sami_gor.daymark.tts.VoiceRegistry;

public class PackDownloaderTest {

    private static final String PAYLOAD_URL = "https://packs.example/fr/voice.bin";

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private File root;
    private File voices;
    private PackInstaller installer;
    private KeyPair keys;
    private PackSignatureVerifier verifier;

    @Before
    public void setUp() throws Exception {
        root = tmp.newFolder("packs-root");
        voices = tmp.newFolder("kokoro");
        installer = new PackInstaller(root);
        keys = PackTestSupport.ed25519KeyPair();
        verifier = new PackSignatureVerifier(PackTestSupport.anchor(keys.getPublic()));
    }

    private PackDownloader downloader(
            PackTransport transport, long available, boolean allowDevelopmentOnly) {
        return new PackDownloader(
                installer,
                voices,
                transport,
                verifier,
                21000,
                allowDevelopmentOnly,
                new PackTestSupport.FixedFreeSpace(available));
    }

    private byte[] sign(PackManifest manifest) throws Exception {
        return PackTestSupport.sign(keys.getPrivate(), manifest.canonicalBytes());
    }

    private PackDownloader.Result install(PackDownloader downloader, PackManifest manifest)
            throws Exception {
        return downloader.install(
                manifest, PAYLOAD_URL, sign(manifest), (downloaded, total) -> { }, null);
    }

    private static byte[] read(File file) throws Exception {
        return Files.readAllBytes(file.toPath());
    }

    @Test
    public void installsVerifiedPackAndPublishesTheVoiceAtomically() throws Exception {
        byte[] payload = PackTestSupport.utf8("french-voice-payload");
        MockTransport transport = new MockTransport(payload);
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, false);
        PackManifest manifest = PackTestSupport.parseFrench(1, payload);

        PackDownloader.Result result = install(downloader, manifest);

        assertEquals("fr", result.packId);
        assertEquals(1, result.version);
        assertEquals(0, result.previousVersion);
        assertFalse(result.updated());
        assertEquals(1, installer.activeVersion("fr"));
        assertArrayEquals(payload, read(installer.activePayload("fr")));
        assertArrayEquals(payload, read(result.voiceFile));
        assertTrue(VoiceRegistry.installed(voices).contains("ff_siwis"));
        assertEquals("ff_siwis", NarrationVoicePolicy.voiceForLanguage(
                "fr", true, VoiceRegistry.installed(voices)));
        assertFalse(new File(root, "staging/fr-1.part").exists());
        assertFalse(new File(voices, ".ff_siwis.bin.backup").exists());
        assertEquals(1, transport.downloadCalls);
        assertNotNull(transport.lastProgress);
    }

    @Test
    public void truncatedDownloadIsResumedWithoutLosingBytes() throws Exception {
        byte[] payload = PackTestSupport.utf8("0123456789");
        MockTransport transport = new MockTransport(payload);
        transport.bytesWrittenPerCall = 4;
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, false);
        PackManifest manifest = PackTestSupport.parseFrench(1, payload);

        try {
            install(downloader, manifest);
            fail("expected truncated download to fail size check");
        } catch (PackInstaller.PackException e) {
            assertEquals("size-mismatch", e.reason);
        }
        File part = new File(root, "staging/fr-1.part");
        assertEquals(4, part.length());
        assertEquals(0, installer.activeVersion("fr"));

        transport.bytesWrittenPerCall = -1;
        PackDownloader.Result result = install(downloader, manifest);

        assertTrue("second attempt must resume the .part file", transport.lastResume);
        assertEquals(2, transport.downloadCalls);
        assertEquals(1, installer.activeVersion("fr"));
        assertArrayEquals(payload, read(result.voiceFile));
    }

    @Test
    public void cancelledDownloadKeepsPartialBytesAndResumes() throws Exception {
        byte[] payload = PackTestSupport.utf8("cancellable-payload");
        MockTransport transport = new MockTransport(payload);
        transport.cancelAfterBytes = 5;
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, false);
        PackManifest manifest = PackTestSupport.parseFrench(1, payload);

        AtomicBoolean cancelled = new AtomicBoolean(true);
        try {
            downloader.install(manifest, PAYLOAD_URL, sign(manifest), null, cancelled::get);
            fail("expected cancellation");
        } catch (PackInstaller.PackException e) {
            assertEquals("cancelled", e.reason);
        }
        File part = new File(root, "staging/fr-1.part");
        assertEquals(5, part.length());
        assertEquals(0, installer.activeVersion("fr"));

        cancelled.set(false);
        PackDownloader.Result result = downloader.install(
                manifest, PAYLOAD_URL, sign(manifest), null, cancelled::get);
        assertEquals(1, installer.activeVersion("fr"));
        assertArrayEquals(payload, read(result.voiceFile));
    }

    @Test
    public void hashMismatchPreservesThePreviousVersionAndVoice() throws Exception {
        byte[] v1 = PackTestSupport.utf8("voice-version-1");
        MockTransport transport = new MockTransport(v1);
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, false);
        install(downloader, PackTestSupport.parseFrench(1, v1));

        byte[] v2 = PackTestSupport.utf8("voice-version-2");
        PackManifest v2Manifest = PackTestSupport.parseFrench(2, v2);
        transport.payload = PackTestSupport.utf8("tampered-voice2"); // same length as v2
        try {
            install(downloader, v2Manifest);
            fail("expected hash mismatch");
        } catch (PackInstaller.PackException e) {
            assertEquals("hash-mismatch", e.reason);
        }

        assertEquals(1, installer.activeVersion("fr"));
        assertArrayEquals(v1, read(installer.activePayload("fr")));
        assertArrayEquals(v1, read(new File(voices, "ff_siwis.bin")));
        assertFalse(new File(root, "staging/fr-2.part").exists());
    }

    @Test
    public void insufficientStorageFailsBeforeAnyNetworkByte() throws Exception {
        byte[] payload = PackTestSupport.utf8("needs-storage");
        MockTransport transport = new MockTransport(payload);
        long required = PackStoragePreflight.requiredBytes(payload.length, 0);
        PackDownloader downloader = downloader(transport, required - 1, false);
        PackManifest manifest = PackTestSupport.parseFrench(1, payload);

        try {
            install(downloader, manifest);
            fail("expected insufficient-storage");
        } catch (PackInstaller.PackException e) {
            assertEquals("insufficient-storage", e.reason);
        }
        assertEquals(0, transport.downloadCalls);
        assertEquals(0, installer.activeVersion("fr"));
    }

    @Test
    public void appTooOldAndNonDistributablePacksAreRejectedBeforeDownload() throws Exception {
        byte[] payload = PackTestSupport.utf8("spanish-development-pack");
        MockTransport transport = new MockTransport(payload);
        PackManifest tooNew = PackManifest.parse(
                PackTestSupport.frenchManifestJson(1, payload, 21001));
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, true);
        try {
            install(downloader, tooNew);
            fail("expected app-too-old");
        } catch (PackInstaller.PackException e) {
            assertEquals("app-too-old", e.reason);
        }
        assertEquals(0, transport.downloadCalls);

        PackManifest spanish = PackManifest.parse(
                PackTestSupport.spanishManifestJson(1, payload, 21000));
        PackDownloader release = downloader(transport, Long.MAX_VALUE, false);
        try {
            release.install(spanish, PAYLOAD_URL, sign(spanish));
            fail("expected not-distributable");
        } catch (PackInstaller.PackException e) {
            assertEquals("not-distributable", e.reason);
        }
        assertEquals(0, transport.downloadCalls);

        PackDownloader debug = downloader(transport, Long.MAX_VALUE, true);
        PackDownloader.Result result = debug.install(spanish, PAYLOAD_URL, sign(spanish));
        assertEquals(1, installer.activeVersion("es"));
        assertArrayEquals(payload, read(result.voiceFile));
        assertTrue(VoiceRegistry.installed(voices).contains("em_alex"));
    }

    @Test
    public void signatureMismatchIsRejectedBeforeDownload() throws Exception {
        byte[] payload = PackTestSupport.utf8("signature-check");
        MockTransport transport = new MockTransport(payload);
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, false);
        PackManifest manifest = PackTestSupport.parseFrench(1, payload);
        KeyPair other = PackTestSupport.ed25519KeyPair();
        byte[] wrongSignature = PackTestSupport.sign(
                other.getPrivate(), manifest.canonicalBytes());

        try {
            downloader.install(manifest, PAYLOAD_URL, wrongSignature);
            fail("expected signature mismatch");
        } catch (PackInstaller.PackException e) {
            assertEquals("signature-mismatch", e.reason);
        }
        assertEquals(0, transport.downloadCalls);
        assertEquals(0, installer.activeVersion("fr"));
    }

    @Test
    public void updateKeepsThePreviousVersionOnDiskAndPublishesTheNewVoice() throws Exception {
        byte[] v1 = PackTestSupport.utf8("old-voice");
        byte[] v2 = PackTestSupport.utf8("new-voice");
        MockTransport transport = new MockTransport(v1);
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, false);
        install(downloader, PackTestSupport.parseFrench(1, v1));

        transport.payload = v2;
        PackDownloader.Result result = install(downloader, PackTestSupport.parseFrench(2, v2));

        assertEquals(2, installer.activeVersion("fr"));
        assertEquals(1, result.previousVersion);
        assertTrue(result.updated());
        assertTrue(new File(root, "packs/fr/1/payload").isFile());
        assertArrayEquals(v2, read(result.voiceFile));
    }

    @Test
    public void previousVoiceIsActiveDuringAnUpdateDownload() throws Exception {
        byte[] v1 = PackTestSupport.utf8("voice-one");
        byte[] v2 = PackTestSupport.utf8("voice-two");
        MockTransport transport = new MockTransport(v1);
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, false);
        install(downloader, PackTestSupport.parseFrench(1, v1));
        final File voice = new File(voices, "ff_siwis.bin");

        transport.payload = v2;
        PackManifest v2Manifest = PackTestSupport.parseFrench(2, v2);
        PackTransport.Progress progress = (downloaded, total) -> {
            assertEquals("previous version must stay active while downloading",
                    1, installer.activeVersion("fr"));
            try {
                assertArrayEquals(v1, read(voice));
            } catch (Exception e) {
                throw new AssertionError(e);
            }
        };
        downloader.install(v2Manifest, PAYLOAD_URL, sign(v2Manifest), progress, null);

        assertEquals(2, installer.activeVersion("fr"));
        assertArrayEquals(v2, read(voice));
    }

    @Test
    public void activationFailureRollsBackThePreviousVoice() throws Exception {
        byte[] v1 = PackTestSupport.utf8("voice-stable");
        byte[] v2 = PackTestSupport.utf8("voice-broken-activation");
        MockTransport transport = new MockTransport(v1);
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, false);
        install(downloader, PackTestSupport.parseFrench(1, v1));

        // Force the pointer write to fail: a directory cannot be opened as
        // current.tmp. The new voice has already been published by then, so the
        // downloader must restore the previous bytes.
        File blocker = new File(root, "packs/fr/current.tmp");
        assertTrue(blocker.mkdirs());
        assertTrue(new File(blocker, "keep").createNewFile());

        transport.payload = v2;
        try {
            install(downloader, PackTestSupport.parseFrench(2, v2));
            fail("expected activation failure");
        } catch (PackInstaller.PackException e) {
            assertEquals("io", e.reason);
        }

        assertEquals("previous version must stay active", 1, installer.activeVersion("fr"));
        assertArrayEquals(v1, read(new File(voices, "ff_siwis.bin")));
        assertArrayEquals(v1, read(installer.activePayload("fr")));
        assertTrue(blocker.isDirectory());
    }

    @Test
    public void removalPreservesEnglishAndReinstallWorks() throws Exception {
        byte[] english = PackTestSupport.utf8("built-in-english-voice");
        PackTestSupport.write(new File(voices, "bm_fable.bin"), english);
        byte[] french = PackTestSupport.utf8("french-voice");
        MockTransport transport = new MockTransport(french);
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, false);
        install(downloader, PackTestSupport.parseFrench(1, french));

        PackDownloader.Removed removed = downloader.remove("fr");
        assertEquals("fr", removed.packId);
        assertEquals("ff_siwis", removed.voiceId);
        assertTrue(removed.voiceDeleted);
        assertEquals(0, installer.activeVersion("fr"));
        assertNull(installer.activePayload("fr"));
        assertFalse(new File(voices, "ff_siwis.bin").exists());
        assertArrayEquals(english, read(new File(voices, "bm_fable.bin")));
        assertEquals("[bm_fable]", VoiceRegistry.installed(voices).toString());
        assertNull("a removed French voice must not be selectable",
                NarrationVoicePolicy.voiceForLanguage(
                        "fr", true, VoiceRegistry.installed(voices)));
        assertEquals("bm_fable", NarrationVoicePolicy.voiceForLanguage(
                "en", true, VoiceRegistry.installed(voices)));

        try {
            downloader.remove("en");
            fail("English must never be removable");
        } catch (PackInstaller.PackException e) {
            assertEquals("builtin-pack", e.reason);
        }
        assertArrayEquals(english, read(new File(voices, "bm_fable.bin")));

        PackDownloader.Result reinstalled = install(downloader, PackTestSupport.parseFrench(1, french));
        assertEquals(1, installer.activeVersion("fr"));
        assertArrayEquals(french, read(reinstalled.voiceFile));
    }

    @Test
    public void fetchManifestAuthenticatesTheSignatureDocument() throws Exception {
        byte[] payload = PackTestSupport.utf8("fetched-voice");
        MockTransport transport = new MockTransport(payload);
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, false);
        PackManifest manifest = PackTestSupport.parseFrench(5, payload);
        String manifestUrl = "https://packs.example/fr/manifest.json";
        String signatureUrl = manifestUrl + ".sig";
        transport.metadata.put(manifestUrl,
                PackTestSupport.utf8(PackTestSupport.frenchManifestJson(5, payload, 21000)));
        transport.metadata.put(signatureUrl, sign(manifest));

        PackManifest fetched = downloader.fetchManifest(manifestUrl, signatureUrl);
        assertEquals(5, fetched.version());
        assertEquals("ff_siwis", fetched.voiceId());

        transport.metadata.put(signatureUrl, new byte[64]);
        try {
            downloader.fetchManifest(manifestUrl, signatureUrl);
            fail("expected signature-mismatch");
        } catch (PackInstaller.PackException e) {
            assertEquals("signature-mismatch", e.reason);
        }
    }

    @Test
    public void oversizedPartialFileIsDiscardedAndRedownloaded() throws Exception {
        byte[] payload = PackTestSupport.utf8("short-pack");
        File part = new File(root, "staging/fr-1.part");
        assertTrue(part.getParentFile().mkdirs());
        PackTestSupport.write(part, new byte[payload.length + 10]);
        MockTransport transport = new MockTransport(payload);
        PackDownloader downloader = downloader(transport, Long.MAX_VALUE, false);

        PackDownloader.Result result = install(downloader, PackTestSupport.parseFrench(1, payload));
        assertFalse(transport.lastResume);
        assertEquals(1, installer.activeVersion("fr"));
        assertArrayEquals(payload, read(result.voiceFile));
    }

    @Test
    public void storagePreflightAccountsForStagingAndVoiceCopy() {
        long payload = 522_240L;
        assertTrue(PackStoragePreflight.requiredBytes(payload, 0) > payload * 2);
        assertEquals(
                PackStoragePreflight.requiredBytes(payload, 0) - payload / 2,
                PackStoragePreflight.requiredBytes(payload, payload / 2));
        assertTrue(PackStoragePreflight.hasRoom(
                PackStoragePreflight.requiredBytes(payload, 0), payload, 0));
        assertFalse(PackStoragePreflight.hasRoom(
                PackStoragePreflight.requiredBytes(payload, 0) - 1, payload, 0));
        assertEquals("absurd sizes must fail closed", Long.MAX_VALUE,
                PackStoragePreflight.requiredBytes(Long.MAX_VALUE, 0));
    }
}
