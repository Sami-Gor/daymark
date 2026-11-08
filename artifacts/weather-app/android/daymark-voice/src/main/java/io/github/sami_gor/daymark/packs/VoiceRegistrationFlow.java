package io.github.sami_gor.daymark.packs;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Application-facing flow that connects a verified pack install to native
 * voice registration and exposes per-voice states to the bridge/UI.
 *
 * <p>The plugin owns one instance. Callers must first record the verified
 * install ({@link #installVerified}) and then {@link #activate}, which asks the
 * runtime to register the voice. READY is only reported when the runtime's
 * loaded set contains the requested voice.
 */
public final class VoiceRegistrationFlow {

    public interface Result {
        void onResult(boolean ready, String error, Map<String, String> states);
    }

    private final VoiceActivationCoordinator coordinator;

    public VoiceRegistrationFlow(VoiceActivationCoordinator.Registrar registrar) {
        this.coordinator = new VoiceActivationCoordinator(registrar);
    }

    /** Records that a verified, atomically activated voice file is installed. */
    public synchronized void installVerified(String voiceId) {
        coordinator.installed(voiceId);
    }

    /**
     * Activates an installed voice: registration is attempted and the callback
     * reports whether the runtime actually loaded it.
     */
    public synchronized void activate(final String voiceId, final Result result) {
        if (coordinator.state(voiceId) == VoiceActivationCoordinator.State.AVAILABLE) {
            // The file exists but this flow was not told; treat as not installed
            // rather than pretending it is ready.
            result.onResult(false, "not-installed", states());
            return;
        }
        coordinator.register(voiceId, new VoiceActivationCoordinator.Completion() {
            @Override
            public void onFinished(boolean ready, String error) {
                result.onResult(ready, error, states());
            }
        });
    }

    /** Clears readiness after pack removal; other voices stay ready. */
    public synchronized void removed(String voiceId) {
        coordinator.removed(voiceId);
    }

    public synchronized Map<String, String> states() {
        Map<String, String> snapshot = new LinkedHashMap<>();
        for (String voice : new String[]{"bm_fable", "ff_siwis", "em_alex"}) {
            snapshot.put(voice,
                    coordinator.state(voice).name().toLowerCase(java.util.Locale.ROOT));
        }
        return snapshot;
    }

    public synchronized boolean isReady(String voiceId) {
        return coordinator.isReady(voiceId);
    }

    public synchronized String lastError() {
        return coordinator.lastError();
    }
}
