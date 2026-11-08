package io.github.sami_gor.daymark.packs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import org.junit.Test;

public class VoiceActivationCoordinatorTest {

    /** Fake runtime that records requests and can fail or omit a voice. */
    private static final class FakeRegistrar implements VoiceActivationCoordinator.Registrar {
        Set<String> loaded = new HashSet<>();
        boolean fail;
        String failureReason;
        int calls;

        @Override
        public void register(String voiceId, VoiceActivationCoordinator.RegistrationCallback callback) {
            calls += 1;
            if (fail) {
                callback.onFailed(failureReason);
                return;
            }
            callback.onRegistered(loaded);
        }
    }

    @Test
    public void installedIsNotReadyUntilRegistrationLoadsTheVoice() {
        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("ff_siwis");
        VoiceActivationCoordinator coordinator = new VoiceActivationCoordinator(registrar);
        coordinator.installed("ff_siwis");

        assertEquals(VoiceActivationCoordinator.State.INSTALLED, coordinator.state("ff_siwis"));
        assertFalse(coordinator.isReady("ff_siwis"));

        coordinator.register("ff_siwis");

        assertEquals(VoiceActivationCoordinator.State.READY, coordinator.state("ff_siwis"));
        assertTrue(coordinator.isReady("ff_siwis"));
        assertTrue(coordinator.readyVoices().contains("ff_siwis"));
    }

    @Test
    public void aRegistrationThatDoesNotLoadTheVoiceIsNeverReady() {
        FakeRegistrar registrar = new FakeRegistrar();
        // Engine reports success but the voice is absent from its loaded set.
        registrar.loaded.add("bm_fable");
        VoiceActivationCoordinator coordinator = new VoiceActivationCoordinator(registrar);
        coordinator.installed("ff_siwis");

        coordinator.register("ff_siwis");

        assertFalse(coordinator.isReady("ff_siwis"));
        assertEquals(VoiceActivationCoordinator.State.FAILED, coordinator.state("ff_siwis"));
        assertEquals("voice-not-loaded", coordinator.lastError());
    }

    @Test
    public void failedRegistrationPreservesPreviouslyReadyVoices() {
        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("bm_fable");
        VoiceActivationCoordinator coordinator = new VoiceActivationCoordinator(registrar);
        coordinator.installed("bm_fable");
        coordinator.register("bm_fable");
        assertTrue(coordinator.isReady("bm_fable"));

        registrar.fail = true;
        registrar.failureReason = "reload-failed";
        coordinator.installed("ff_siwis");
        coordinator.register("ff_siwis");

        assertFalse(coordinator.isReady("ff_siwis"));
        assertTrue(coordinator.isReady("bm_fable"));
        assertEquals("reload-failed", coordinator.lastError());
    }

    @Test
    public void retryAfterFailureCanReachReady() {
        FakeRegistrar registrar = new FakeRegistrar();
        registrar.fail = true;
        registrar.failureReason = "reload-failed-unrecovered";
        VoiceActivationCoordinator coordinator = new VoiceActivationCoordinator(registrar);
        coordinator.installed("ff_siwis");
        coordinator.register("ff_siwis");
        assertFalse(coordinator.isReady("ff_siwis"));

        registrar.fail = false;
        registrar.loaded.add("ff_siwis");
        coordinator.register("ff_siwis");
        assertEquals(2, registrar.calls);
        assertTrue(coordinator.isReady("ff_siwis"));
    }

    @Test
    public void removalClearsReadyStateButKeepsOtherVoices() {
        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("bm_fable");
        registrar.loaded.add("ff_siwis");
        VoiceActivationCoordinator coordinator = new VoiceActivationCoordinator(registrar);
        coordinator.installed("bm_fable");
        coordinator.register("bm_fable");
        coordinator.installed("ff_siwis");
        coordinator.register("ff_siwis");

        coordinator.removed("ff_siwis");

        assertFalse(coordinator.isReady("ff_siwis"));
        assertTrue(coordinator.isReady("bm_fable"));
        assertEquals(VoiceActivationCoordinator.State.AVAILABLE, coordinator.state("ff_siwis"));
    }

    @Test
    public void registrationBeforeInstallationIsRejected() {
        FakeRegistrar registrar = new FakeRegistrar();
        VoiceActivationCoordinator coordinator = new VoiceActivationCoordinator(registrar);
        coordinator.register("ff_siwis");
        assertEquals(0, registrar.calls);
        assertEquals("not-installed", coordinator.lastError());
        assertFalse(coordinator.isReady("ff_siwis"));
    }

    @Test
    public void readySetIsACopyAndCannotBeMutatedExternally() {
        FakeRegistrar registrar = new FakeRegistrar();
        registrar.loaded.add("ff_siwis");
        VoiceActivationCoordinator coordinator = new VoiceActivationCoordinator(registrar);
        coordinator.installed("ff_siwis");
        coordinator.register("ff_siwis");
        try {
            coordinator.readyVoices().add("em_alex");
        } catch (UnsupportedOperationException expected) {
            // expected
        }
        assertFalse(coordinator.isReady("em_alex"));
        assertEquals(Collections.singleton("ff_siwis"), coordinator.readyVoices());
    }
}
