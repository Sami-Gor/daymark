package io.github.sami_gor.daymark.packs;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Sequences pack installation into Kokoro runtime registration.
 *
 * <p>"Installed" and "ready" are deliberately different states: a verified
 * voice file on disk is not usable until the native engine has reinitialised
 * and reported that voice in its loaded set. This class is the single place
 * that enforces the sequence
 * install → register → loaded-check → ready, and it never reports ready when
 * registration failed or the engine did not load the voice.
 *
 * <p>It owns no I/O and no native code: the pack manager supplies an
 * {@link Registrar}, and the caller uses {@link #isReady(String)} before
 * allowing selection or synthesis.
 */
public final class VoiceActivationCoordinator {

    public enum State {
        AVAILABLE,
        DOWNLOADING,
        VERIFYING,
        INSTALLED,
        ACTIVATING,
        READY,
        FAILED
    }

    /** Runtime registration port, implemented around Kokoro's registerVoice. */
    public interface Registrar {
        /**
         * Registers an installed voice and reports the voices the native
         * engine actually loaded. Must never fall back to another voice.
         */
        void register(String voiceId, RegistrationCallback callback);
    }

    public interface RegistrationCallback {
        void onRegistered(Set<String> loadedVoices);

        void onFailed(String reason);
    }

    /** Optional completion signal for callers that must await readiness. */
    public interface Completion {
        void onFinished(boolean ready, String error);
    }

    private final Registrar registrar;
    private final Map<String, State> states = new LinkedHashMap<>();
    private final Set<String> readyVoices = new LinkedHashSet<>();
    private String lastError = "";

    public VoiceActivationCoordinator(Registrar registrar) {
        this.registrar = registrar;
    }

    public synchronized void available(String voiceId) {
        put(voiceId, State.AVAILABLE);
    }

    public synchronized void downloading(String voiceId) {
        put(voiceId, State.DOWNLOADING);
    }

    public synchronized void verifying(String voiceId) {
        put(voiceId, State.VERIFYING);
    }

    /** Verified bytes are on disk; the voice is not yet usable. */
    public synchronized void installed(String voiceId) {
        put(voiceId, State.INSTALLED);
    }

    /**
     * Marks the voice activating and asks the runtime to register it.
     *
     * <p>The voice becomes ready only when the callback lists it among the
     * loaded voices. A stale or failed registration leaves the previous ready
     * voices untouched and records a specific error.
     */
    public synchronized void register(String voiceId) {
        register(voiceId, null);
    }

    public synchronized void register(final String voiceId, final Completion completion) {
        if (voiceId == null || voiceId.isEmpty()) {
            fail(voiceId, "invalid-voice");
            if (completion != null) completion.onFinished(false, "invalid-voice");
            return;
        }
        State current = states.get(voiceId);
        if (current != State.INSTALLED && current != State.FAILED && current != State.READY) {
            fail(voiceId, "not-installed");
            if (completion != null) completion.onFinished(false, "not-installed");
            return;
        }
        put(voiceId, State.ACTIVATING);
        registrar.register(voiceId, new RegistrationCallback() {
            @Override
            public void onRegistered(Set<String> loadedVoices) {
                synchronized (VoiceActivationCoordinator.this) {
                    if (loadedVoices == null || !loadedVoices.contains(voiceId)) {
                        failLocked(voiceId, "voice-not-loaded");
                        if (completion != null) completion.onFinished(false, "voice-not-loaded");
                        return;
                    }
                    readyVoices.add(voiceId);
                    states.put(voiceId, State.READY);
                    lastError = "";
                    if (completion != null) completion.onFinished(true, "");
                }
            }

            @Override
            public void onFailed(String reason) {
                synchronized (VoiceActivationCoordinator.this) {
                    String error = reason == null || reason.isEmpty()
                            ? "registration-failed" : reason;
                    failLocked(voiceId, error);
                    if (completion != null) completion.onFinished(false, error);
                }
            }
        });
    }

    /** Removes a voice from the ready set, e.g. after pack removal. */
    public synchronized void removed(String voiceId) {
        readyVoices.remove(voiceId);
        states.put(voiceId, State.AVAILABLE);
    }

    public synchronized boolean isReady(String voiceId) {
        return readyVoices.contains(voiceId);
    }

    public synchronized State state(String voiceId) {
        State state = states.get(voiceId);
        return state == null ? State.AVAILABLE : state;
    }

    public synchronized Set<String> readyVoices() {
        return Collections.unmodifiableSet(new LinkedHashSet<>(readyVoices));
    }

    public synchronized String lastError() {
        return lastError;
    }

    private void put(String voiceId, State state) {
        states.put(voiceId, state);
    }

    private void fail(String voiceId, String reason) {
        synchronized (this) {
            failLocked(voiceId, reason);
        }
    }

    private void failLocked(String voiceId, String reason) {
        lastError = reason;
        if (voiceId != null) {
            states.put(voiceId, State.FAILED);
            // A previously ready voice stays ready: a failed update must not
            // strand the user without the voice that currently works.
        }
    }
}
