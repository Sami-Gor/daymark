package io.github.sami_gor.daymark.packs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.junit.Test;

public class VoiceRegistrationFlowTest {

    private static final class FakeRegistrar implements VoiceActivationCoordinator.Registrar {
        Set<String> loaded = new HashSet<>();
        boolean fail;
        String reason = "reload-failed";

        @Override
        public void register(String voiceId, VoiceActivationCoordinator.RegistrationCallback callback) {
            if (fail) {
                callback.onFailed(reason);
            } else {
                callback.onRegistered(loaded);
            }
        }
    }

    private static final class Capture implements VoiceRegistrationFlow.Result {
        boolean ready;
        String error;
        Map<String, String> states;

        @Override
        public void onResult(boolean ready, String error, Map<String, String> states) {
            this.ready = ready;
            this.error = error;
            this.states = states;
        }
    }

    @Test
    public void verifiedInstallThatTheRuntimeLoadsBecomesReady() {
        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("ff_siwis");
        VoiceRegistrationFlow flow = new VoiceRegistrationFlow(registrar);
        flow.installVerified("ff_siwis");
        Capture capture = new Capture();
        flow.activate("ff_siwis", capture);
        assertTrue(capture.ready);
        assertEquals("", capture.error);
        assertEquals("ready", capture.states.get("ff_siwis"));
        assertTrue(flow.isReady("ff_siwis"));
    }

    @Test
    public void aLoadedSetWithoutTheRequestedVoiceIsNeverReady() {
        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("bm_fable");
        VoiceRegistrationFlow flow = new VoiceRegistrationFlow(registrar);
        flow.installVerified("ff_siwis");
        Capture capture = new Capture();
        flow.activate("ff_siwis", capture);
        assertFalse(capture.ready);
        assertEquals("voice-not-loaded", capture.error);
        assertEquals("failed", capture.states.get("ff_siwis"));
        assertFalse(flow.isReady("ff_siwis"));
    }

    @Test
    public void failedRegistrationPreservesPreviouslyReadyVoices() {
        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("bm_fable");
        VoiceRegistrationFlow flow = new VoiceRegistrationFlow(registrar);
        flow.installVerified("bm_fable");
        Capture base = new Capture();
        flow.activate("bm_fable", base);
        assertTrue(base.ready);

        registrar.fail = true;
        flow.installVerified("ff_siwis");
        Capture failed = new Capture();
        flow.activate("ff_siwis", failed);
        assertFalse(failed.ready);
        assertTrue(flow.isReady("bm_fable"));
        assertEquals("ready", failed.states.get("bm_fable"));
    }

    @Test
    public void retryAfterFailureCanReachReady() {
        FakeRegistrar registrar = new FakeRegistrar();
        registrar.fail = true;
        VoiceRegistrationFlow flow = new VoiceRegistrationFlow(registrar);
        flow.installVerified("ff_siwis");
        Capture first = new Capture();
        flow.activate("ff_siwis", first);
        assertFalse(first.ready);

        registrar.fail = false;
        registrar.loaded.add("ff_siwis");
        Capture second = new Capture();
        flow.activate("ff_siwis", second);
        assertTrue(second.ready);
        assertTrue(flow.isReady("ff_siwis"));
    }

    @Test
    public void activationBeforeInstallationIsRejected() {
        FakeRegistrar registrar = new FakeRegistrar();
        VoiceRegistrationFlow flow = new VoiceRegistrationFlow(registrar);
        Capture capture = new Capture();
        flow.activate("ff_siwis", capture);
        assertFalse(capture.ready);
        assertEquals("not-installed", capture.error);
    }

    @Test
    public void statesDistinguishAvailableFromReady() {
        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("ff_siwis");
        VoiceRegistrationFlow flow = new VoiceRegistrationFlow(registrar);
        assertEquals("available", flow.states().get("ff_siwis"));
        flow.installVerified("ff_siwis");
        assertEquals("installed", flow.states().get("ff_siwis"));
        Capture capture = new Capture();
        flow.activate("ff_siwis", capture);
        assertEquals("ready", flow.states().get("ff_siwis"));
    }

    @Test
    public void removalClearsReadinessButKeepsOtherVoices() {
        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("bm_fable");
        registrar.loaded.add("ff_siwis");
        VoiceRegistrationFlow flow = new VoiceRegistrationFlow(registrar);
        flow.installVerified("bm_fable");
        flow.installVerified("ff_siwis");
        flow.activate("bm_fable", new Capture());
        flow.activate("ff_siwis", new Capture());
        assertTrue(flow.isReady("ff_siwis"));

        flow.removed("ff_siwis");
        assertFalse(flow.isReady("ff_siwis"));
        assertTrue(flow.isReady("bm_fable"));
        assertEquals("available", flow.states().get("ff_siwis"));
    }
}
