package io.github.sami_gor.daymark.packs;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.nio.file.Files;
import java.security.KeyPair;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Boundary test for the user-triggered narration install.
 *
 * <p>The real {@link PackDownloader}, {@link PackInstaller},
 * {@link PackSignatureVerifier} and {@link VoiceRegistrationFlow} are wired
 * together; only the transport (a local fixture) and the native registrar are
 * fakes. This proves the signed-manifest → download → verify → activate →
 * register → loaded-set → READY sequence, including failure behaviour and the
 * operation-id/stale-event rules that protect the UI.
 */
public class VoicePackManagerTest {

    private static final long APP_VERSION = 21000L;
    private static final String BASE = "https://packs.test.daymark/v21";

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private KeyPair signingKeys;
    private PackSourceConfig source;
    private PackInstaller installer;
    private File voicesDir;
    private FakeRegistrar registrar;
    private VoiceRegistrationFlow registration;
    private PackTestSupport.MockTransport transport;
    private final List<VoicePackManager.Progress> events = new ArrayList<>();

    @Before
    public void setUp() throws Exception {
        signingKeys = PackTestSupport.ed25519KeyPair();
        source = PackSourceConfig.fromBuildConfig(
                BASE, hex(PackTestSupport.anchor(signingKeys.getPublic())), "ff_siwis");
        File root = tmp.newFolder("pack-root");
        installer = new PackInstaller(root);
        voicesDir = tmp.newFolder("kokoro");
        registrar = new FakeRegistrar();
        registration = new VoiceRegistrationFlow(registrar);
        transport = new PackTestSupport.MockTransport(new byte[0]);
        events.clear();
    }

    // ------------------------------------------------------------------ tests

    @Test
    public void signedManifestDownloadsVerifiesActivatesRegistersAndReachesReady()
            throws Exception {
        byte[] payload = "french-voice-v1".getBytes("UTF-8");
        fixture(payload, 1L);
        registrar.loaded.add("ff_siwis");

        VoicePackManager manager = manager(new DirectExecutor(), transport);
        Capture capture = new Capture();
        assertNull(manager.start("ff_siwis", "op-ready", capture));

        assertTrue("completion ran synchronously with the direct executor", capture.finished);
        assertTrue(capture.outcome.ready);
        assertEquals("", capture.outcome.errorCode);
        assertEquals("ready", capture.outcome.states.get("ff_siwis"));
        assertArrayEquals(payload,
                Files.readAllBytes(new File(voicesDir, "ff_siwis.bin").toPath()));
        assertEquals(1L, installer.activeVersion("fr"));
        assertTrue(registration.isReady("ff_siwis"));
        assertTrue(manager.info("ff_siwis").installed);
        assertTrue(manager.info("ff_siwis").ready);
        assertEquals(PackSourceConfig.KNOWN_PAYLOAD_BYTES,
                manager.info("ff_siwis").sizeBytes);
        assertTrue(manager.info("ff_siwis").licenceAttribution.toLowerCase(Locale.ROOT)
                .contains("siwis"));
        assertTrue(manager.info("ff_siwis").licenceAttribution
                .contains("10.7488/ds/1705"));

        assertPhases(events, true,
                VoicePackManager.Phase.VERIFYING,
                VoicePackManager.Phase.DOWNLOADING,
                VoicePackManager.Phase.INSTALLING,
                VoicePackManager.Phase.ACTIVATING,
                VoicePackManager.Phase.REGISTERING,
                VoicePackManager.Phase.READY);
        VoicePackManager.Progress lastDownload = lastDownloadEvent(events);
        assertEquals(payload.length, lastDownload.bytesReceived);
        assertEquals(payload.length, lastDownload.totalBytes);
        assertEquals(100d, lastDownload.percentage, 0.001d);
        VoicePackManager.Progress ready = events.get(events.size() - 1);
        assertEquals(VoicePackManager.Phase.READY, ready.phase);
        assertEquals("op-ready", ready.operationId);
        assertNoConsecutiveDuplicates(events);
    }

    @Test
    public void wrongPayloadDigestFailsWithoutReadyAndPreservesPreviousVoice()
            throws Exception {
        byte[] v1 = "french-voice-v1".getBytes("UTF-8");
        fixture(v1, 1L);
        registrar.loaded.add("ff_siwis");
        VoicePackManager manager = manager(new DirectExecutor(), transport);
        Capture first = new Capture();
        assertNull(manager.start("ff_siwis", "op-v1", first));
        assertTrue(first.outcome.ready);
        File voiceFile = new File(voicesDir, "ff_siwis.bin");
        byte[] installedBefore = Files.readAllBytes(voiceFile.toPath());
        events.clear();

        byte[] v2 = "french-voice-v2".getBytes("UTF-8");
        fixture(v2, 2L);
        // Keep the size stable so the installer reaches the SHA-256 check.
        byte[] tampered = v2.clone();
        tampered[0] ^= 0x01;
        transport.payload = tampered;

        Capture failed = new Capture();
        assertNull(manager.start("ff_siwis", "op-v2", failed));
        assertTrue(failed.finished);
        assertFalse(failed.outcome.ready);
        assertEquals("hash-mismatch", failed.outcome.errorCode);
        assertArrayEquals("the previous working voice bytes must survive", installedBefore,
                Files.readAllBytes(voiceFile.toPath()));
        assertEquals(1L, installer.activeVersion("fr"));
        assertTrue("a failed update must not strand the previously ready voice",
                registration.isReady("ff_siwis"));
        assertTrue(manager.info("ff_siwis").ready);
        assertPhases(events, false, VoicePackManager.Phase.READY);
        assertPhases(events, true, VoicePackManager.Phase.FAILED);
        VoicePackManager.Progress failedEvent = events.get(events.size() - 1);
        assertEquals("hash-mismatch", failedEvent.errorCode);
        assertEquals("op-v2", failedEvent.operationId);
    }

    @Test
    public void wrongManifestSignatureFailsBeforeAnyPayloadBytes() throws Exception {
        byte[] payload = "french-voice".getBytes("UTF-8");
        fixture(payload, 1L);
        // Re-sign the same manifest with a key the pinned anchor does not trust.
        PackManifest manifest = PackManifest.parse(
                PackTestSupport.frenchManifestJson(1L, payload, APP_VERSION));
        KeyPair attacker = PackTestSupport.ed25519KeyPair();
        byte[] forged = PackTestSupport.sign(attacker.getPrivate(), manifest.canonicalBytes());
        transport.metadata.put(source.signatureUrl("ff_siwis"), forged);
        registrar.loaded.add("ff_siwis");

        VoicePackManager manager = manager(new DirectExecutor(), transport);
        Capture capture = new Capture();
        assertNull(manager.start("ff_siwis", "op-forged", capture));

        assertTrue(capture.finished);
        assertFalse(capture.outcome.ready);
        assertEquals("signature-mismatch", capture.outcome.errorCode);
        assertEquals("no payload may be requested before signature verification",
                0, transport.downloadCalls);
        assertFalse(new File(voicesDir, "ff_siwis.bin").exists());
        assertEquals(0L, installer.activeVersion("fr"));
        assertFalse(registration.isReady("ff_siwis"));
        assertPhases(events, false, VoicePackManager.Phase.READY);
    }

    @Test
    public void wrongManifestSignatureOnUpdatePreservesPreviousVoiceAndReadiness()
            throws Exception {
        byte[] v1 = "french-voice-v1".getBytes("UTF-8");
        fixture(v1, 1L);
        registrar.loaded.add("ff_siwis");
        VoicePackManager manager = manager(new DirectExecutor(), transport);
        Capture first = new Capture();
        assertNull(manager.start("ff_siwis", "op-v1", first));
        assertTrue(first.outcome.ready);
        File voiceFile = new File(voicesDir, "ff_siwis.bin");
        byte[] installedBefore = Files.readAllBytes(voiceFile.toPath());
        int downloadsBefore = transport.downloadCalls;
        events.clear();

        byte[] v2 = "french-voice-v2".getBytes("UTF-8");
        fixture(v2, 2L);
        PackManifest manifest = PackManifest.parse(
                PackTestSupport.frenchManifestJson(2L, v2, APP_VERSION));
        KeyPair attacker = PackTestSupport.ed25519KeyPair();
        transport.metadata.put(source.signatureUrl("ff_siwis"),
                PackTestSupport.sign(attacker.getPrivate(), manifest.canonicalBytes()));

        Capture forged = new Capture();
        assertNull(manager.start("ff_siwis", "op-forged-update", forged));
        assertFalse(forged.outcome.ready);
        assertEquals("signature-mismatch", forged.outcome.errorCode);
        assertEquals("the forged manifest must not request payload bytes",
                downloadsBefore, transport.downloadCalls);
        assertArrayEquals(installedBefore, Files.readAllBytes(voiceFile.toPath()));
        assertEquals(1L, installer.activeVersion("fr"));
        assertTrue("a rejected update leaves the previous voice ready",
                registration.isReady("ff_siwis"));
        assertTrue(manager.info("ff_siwis").ready);
        assertPhases(events, false, VoicePackManager.Phase.READY);
        assertPhases(events, true, VoicePackManager.Phase.FAILED);
    }

    @Test
    public void rejectsASecondInstallWhileOneIsActive() throws Exception {
        fixture("french-voice".getBytes("UTF-8"), 1L);
        registrar.loaded.add("ff_siwis");
        ManualExecutor executor = new ManualExecutor();
        VoicePackManager manager = manager(executor, transport);

        Capture first = new Capture();
        Capture second = new Capture();
        assertNull(manager.start("ff_siwis", "op-1", first));
        assertEquals("install-in-progress", manager.start("ff_siwis", "op-2", second));
        assertFalse("rejected operations must not complete", second.finished);
        assertTrue(manager.isInstalling());

        executor.runAll();
        assertTrue(first.outcome.ready);
        assertFalse(manager.isInstalling());

        Capture third = new Capture();
        assertNull(manager.start("ff_siwis", "op-3", third));
        executor.runAll();
        assertTrue(third.outcome.ready);
    }

    @Test
    public void cancelledOperationEmitsFailedOnceAndLateProgressIsIgnored() throws Exception {
        byte[] payload = "french-voice".getBytes("UTF-8");
        fixture(payload, 1L);
        registrar.loaded.add("ff_siwis");
        ManualExecutor executor = new ManualExecutor();
        VoicePackManager manager = manager(executor, transport);

        Capture first = new Capture();
        assertNull(manager.start("ff_siwis", "op-cancel", first));
        // No executor run yet, so cancellation happens before any I/O.
        assertTrue(manager.cancel("op-cancel"));
        assertFalse(manager.cancel("op-cancel"));
        assertTrue(first.finished);
        assertFalse(first.outcome.ready);
        assertEquals("cancelled", first.outcome.errorCode);
        assertPhases(events, false, VoicePackManager.Phase.READY);
        assertPhases(events, true, VoicePackManager.Phase.FAILED);

        executor.runAll();
        // The cancelled worker must not add a second terminal event.
        long failedCount = events.stream()
                .filter(event -> event.phase == VoicePackManager.Phase.FAILED)
                .count();
        assertEquals(1L, failedCount);
        assertFalse(manager.isInstalling());
    }

    @Test
    public void staleProgressFromAFinishedOperationCannotMoveTheCurrentOperation()
            throws Exception {
        fixture("french-voice".getBytes("UTF-8"), 1L);
        registrar.loaded.add("ff_siwis");
        ManualExecutor executor = new ManualExecutor();
        VoicePackManager manager = manager(executor, transport);

        Capture first = new Capture();
        assertNull(manager.start("ff_siwis", "op-old", first));
        executor.runAll();
        assertTrue(first.outcome.ready);
        PackTransport.Progress oldProgress = transport.lastProgress;
        int eventCount = events.size();

        Capture second = new Capture();
        assertNull(manager.start("ff_siwis", "op-new", second));
        // A late callback from the completed operation must be dropped.
        oldProgress.onProgress(999_999L, 999_999L);
        assertEquals(eventCount, events.size());
        for (VoicePackManager.Progress event : events.subList(eventCount, events.size())) {
            assertEquals("op-new", event.operationId);
        }

        executor.runAll();
        assertTrue(second.outcome.ready);
        for (VoicePackManager.Progress event : events) {
            assertTrue("events must only ever carry the owning operation id",
                    event.operationId.equals("op-old") || event.operationId.equals("op-new"));
        }
    }

    @Test
    public void duplicateTransportSnapshotsAreEmittedOnce() throws Exception {
        byte[] payload = "french-voice".getBytes("UTF-8");
        fixture(payload, 1L);
        registrar.loaded.add("ff_siwis");
        final PackTestSupport.MockTransport delegate = transport;
        PackTransport duplicating = new PackTransport() {
            @Override
            public DownloadResult download(
                    String url,
                    File destination,
                    boolean resume,
                    long expectedTotalBytes,
                    Progress progress,
                    CancelSignal cancel) throws TransportException {
                if (progress != null) {
                    progress.onProgress(1L, expectedTotalBytes);
                    progress.onProgress(1L, expectedTotalBytes);
                    progress.onProgress(1L, expectedTotalBytes);
                }
                return delegate.download(url, destination, resume, expectedTotalBytes,
                        progress, cancel);
            }

            @Override
            public byte[] fetch(String url, int maxBytes) throws TransportException {
                return delegate.fetch(url, maxBytes);
            }
        };
        VoicePackManager manager = manager(new DirectExecutor(), duplicating);
        Capture capture = new Capture();
        assertNull(manager.start("ff_siwis", "op-dup", capture));
        assertTrue(capture.outcome.ready);
        assertNoConsecutiveDuplicates(events);
        long oneByteSnapshots = events.stream()
                .filter(event -> event.phase == VoicePackManager.Phase.DOWNLOADING
                        && event.bytesReceived == 1L)
                .count();
        assertEquals("three identical snapshots collapse to one", 1L, oneByteSnapshots);
    }

    @Test
    public void unconfiguredOrUnknownVoiceIsRejectedBeforeAnyWork() throws Exception {
        fixture("french-voice".getBytes("UTF-8"), 1L);
        VoicePackManager manager = manager(new DirectExecutor(), transport);
        Capture capture = new Capture();
        assertEquals("unsupported-voice", manager.start("em_alex", "op-x", capture));
        assertEquals("invalid-operation", manager.start("ff_siwis", "bad op id", capture));
        assertFalse(capture.finished);
        assertEquals(0, transport.downloadCalls);
    }

    // --------------------------------------------------------------- fixtures

    private void fixture(byte[] payload, long version) throws Exception {
        transport.payload = payload;
        String json = PackTestSupport.frenchManifestJson(version, payload, APP_VERSION);
        PackManifest manifest = PackManifest.parse(json);
        byte[] signature = PackTestSupport.sign(signingKeys.getPrivate(), manifest.canonicalBytes());
        transport.metadata.put(source.manifestUrl("ff_siwis"),
                json.getBytes("UTF-8"));
        transport.metadata.put(source.signatureUrl("ff_siwis"), signature);
    }

    private VoicePackManager manager(VoicePackManager.Executor executor, PackTransport source)
            throws Exception {
        PackDownloader downloader = new PackDownloader(
                installer,
                voicesDir,
                source,
                new PackSignatureVerifier(source().trustAnchor()),
                APP_VERSION,
                false,
                new PackTestSupport.FixedFreeSpace(64L * 1024L * 1024L));
        return new VoicePackManager(
                source(),
                installer,
                voicesDir,
                downloader,
                registration,
                executor,
                events::add);
    }

    private PackSourceConfig source() {
        return source;
    }

    private static String hex(PackTrustAnchor anchor) {
        StringBuilder hex = new StringBuilder(64);
        for (byte b : anchor.rawPublicKey()) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    private static void assertPhases(
            List<VoicePackManager.Progress> events,
            boolean present,
            VoicePackManager.Phase... phases) {
        int cursor = 0;
        for (VoicePackManager.Progress event : events) {
            if (cursor < phases.length && event.phase == phases[cursor]) {
                cursor++;
            }
        }
        if (present) {
            assertEquals("missing phases in order: " + Arrays.toString(phases),
                    phases.length, cursor);
        } else {
            for (VoicePackManager.Phase forbidden : phases) {
                for (VoicePackManager.Progress event : events) {
                    if (event.phase == forbidden) {
                        fail("unexpected phase " + forbidden);
                    }
                }
            }
        }
    }

    private static VoicePackManager.Progress lastDownloadEvent(
            List<VoicePackManager.Progress> events) {
        VoicePackManager.Progress last = null;
        for (VoicePackManager.Progress event : events) {
            if (event.phase == VoicePackManager.Phase.DOWNLOADING) {
                last = event;
            }
        }
        if (last == null) {
            fail("no downloading event was emitted");
        }
        return last;
    }

    private static void assertNoConsecutiveDuplicates(List<VoicePackManager.Progress> events) {
        for (int i = 1; i < events.size(); i++) {
            VoicePackManager.Progress previous = events.get(i - 1);
            VoicePackManager.Progress current = events.get(i);
            boolean duplicate = previous.phase == current.phase
                    && previous.bytesReceived == current.bytesReceived
                    && previous.totalBytes == current.totalBytes
                    && previous.errorCode.equals(current.errorCode);
            assertFalse("duplicate progress snapshot at index " + i, duplicate);
        }
    }

    // ---------------------------------------------------------------- fakes

    private static final class FakeRegistrar implements VoiceActivationCoordinator.Registrar {
        final Set<String> loaded = new HashSet<>();
        @Override
        public void register(String voiceId,
                VoiceActivationCoordinator.RegistrationCallback callback) {
            callback.onRegistered(new HashSet<>(loaded));
        }
    }

    private static final class Capture implements VoicePackManager.Completion {
        boolean finished;
        VoicePackManager.Outcome outcome;

        @Override
        public void onFinished(VoicePackManager.Outcome outcome) {
            this.finished = true;
            this.outcome = outcome;
        }
    }

    private static final class DirectExecutor implements VoicePackManager.Executor {
        @Override
        public void execute(Runnable command) {
            command.run();
        }
    }

    private static final class ManualExecutor implements VoicePackManager.Executor {
        private final List<Runnable> pending = new ArrayList<>();

        @Override
        public void execute(Runnable command) {
            pending.add(command);
        }

        void runAll() {
            while (!pending.isEmpty()) {
                pending.remove(0).run();
            }
        }
    }
}
