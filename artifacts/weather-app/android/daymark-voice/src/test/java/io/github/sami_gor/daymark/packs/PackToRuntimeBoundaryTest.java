package io.github.sami_gor.daymark.packs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Boundary test: the real installer/activation path feeds the real
 * registration flow. Only the native registrar and the payload source are
 * fakes, so this proves the sequence the application must follow:
 * verified install -> atomic activation -> register -> loaded-set check -> READY.
 */
public class PackToRuntimeBoundaryTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private static final class FakeRegistrar implements VoiceActivationCoordinator.Registrar {
        Set<String> loaded = new HashSet<>();
        String failReason;

        @Override
        public void register(String voiceId, VoiceActivationCoordinator.RegistrationCallback callback) {
            if (failReason != null) {
                callback.onFailed(failReason);
            } else {
                callback.onRegistered(loaded);
            }
        }
    }

    private static final class Capture implements VoiceRegistrationFlow.Result {
        boolean ready;
        String error;
        java.util.Map<String, String> states;

        @Override
        public void onResult(boolean ready, String error, java.util.Map<String, String> states) {
            this.ready = ready;
            this.error = error;
            this.states = states;
        }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        digest.update(java.nio.file.Files.readAllBytes(file.toPath()));
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    private File payload(String name, String content) throws Exception {
        File file = tmp.newFile(name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
        }
        return file;
    }

    @Test
    public void verifiedInstallThenRuntimeRegistrationReachesReady() throws Exception {
        File packRoot = tmp.newFolder("pack-root");
        File voice = payload("ff_siwis.bin", "french-voice");
        PackInstaller installer = new PackInstaller(packRoot);
        PackInstaller.Installed installed = installer.stage(
                "fr", 1, voice, voice.length(), sha256(voice));
        installer.activate(installed);
        assertEquals(1, installer.activeVersion("fr"));

        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("ff_siwis");
        VoiceRegistrationFlow flow = new VoiceRegistrationFlow(registrar);
        flow.installVerified("ff_siwis");
        Capture capture = new Capture();
        flow.activate("ff_siwis", capture);

        assertTrue(capture.ready);
        assertEquals("ready", flow.states().get("ff_siwis"));
    }

    @Test
    public void installWithoutRuntimeLoadIsNeverReadyOrSelectable() throws Exception {
        File packRoot = tmp.newFolder("pack-root-2");
        File voice = payload("ff_siwis.bin", "french-voice");
        PackInstaller installer = new PackInstaller(packRoot);
        installer.activate(installer.stage("fr", 1, voice, voice.length(), sha256(voice)));

        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("bm_fable"); // engine reports a different voice set
        VoiceRegistrationFlow flow = new VoiceRegistrationFlow(registrar);
        flow.installVerified("ff_siwis");
        Capture capture = new Capture();
        flow.activate("ff_siwis", capture);

        assertFalse(capture.ready);
        assertEquals("voice-not-loaded", capture.error);
        assertFalse("UI must not be able to select an unloaded voice", flow.isReady("ff_siwis"));
        assertEquals("failed", flow.states().get("ff_siwis").toLowerCase(Locale.ROOT));
    }

    @Test
    public void failedRegistrationKeepsPreviousVoiceReadyAndRetrySucceeds() throws Exception {
        File packRoot = tmp.newFolder("pack-root-3");
        PackInstaller installer = new PackInstaller(packRoot);
        File french = payload("ff_siwis.bin", "fr");
        installer.activate(installer.stage("fr", 1, french, french.length(), sha256(french)));

        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("bm_fable");
        VoiceRegistrationFlow flow = new VoiceRegistrationFlow(registrar);
        flow.installVerified("bm_fable");
        flow.activate("bm_fable", new Capture());
        assertTrue(flow.isReady("bm_fable"));

        registrar.failReason = "reload-failed";
        flow.installVerified("ff_siwis");
        Capture failed = new Capture();
        flow.activate("ff_siwis", failed);
        assertFalse(failed.ready);
        assertTrue("previous working voice must survive", flow.isReady("bm_fable"));

        registrar.failReason = null;
        registrar.loaded.add("ff_siwis");
        Capture retried = new Capture();
        flow.activate("ff_siwis", retried);
        assertTrue(retried.ready);
        assertTrue(flow.isReady("bm_fable"));
    }
}
