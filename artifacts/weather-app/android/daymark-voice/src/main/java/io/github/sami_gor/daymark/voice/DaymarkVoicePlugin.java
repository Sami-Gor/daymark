package io.github.sami_gor.daymark.voice;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import io.github.sami_gor.daymark.tts.KokoroLocalTtsEngine;
import io.github.sami_gor.daymark.tts.LocalTtsEngine;

/**
 * Capacitor bridge for the validated on-device Kokoro engine.
 *
 * The web layer only sees availability, status, speak/stop and isSpeaking.
 * Model paths, JNI details and the voice file stay native, and the engine is
 * initialized once per process, off the UI thread.
 */
@CapacitorPlugin(name = "DaymarkVoice")
public class DaymarkVoicePlugin extends Plugin implements LocalTtsEngine.Listener {

    private static final String TAG = "DaymarkVoice";
    private static final long READY_TIMEOUT_MS = 45_000L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private KokoroLocalTtsEngine engine;
    /** Connects verified pack installs to native voice registration. */
    private io.github.sami_gor.daymark.packs.VoiceRegistrationFlow voiceFlow;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean focusHeld;
    private LocalTtsEngine.State state = LocalTtsEngine.State.UNINITIALIZED;
    private String lastFailureReason = "";

    private PluginCall pendingSpeak;
    private String queuedText;
    private String queuedLang;
    private List<String> queuedSegments;

    private final Runnable readyTimeout = () -> {
        if (pendingSpeak != null && state != LocalTtsEngine.State.READY && state != LocalTtsEngine.State.STOPPED) {
            PluginCall call = pendingSpeak;
            pendingSpeak = null;
            queuedText = null;
            queuedLang = null;
            queuedSegments = null;
            call.reject("engine not ready in time");
        }
    };

    @Override
    public void load() {
        Context context = getContext();
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        // Resolve the optional native library synchronously so isAvailable()
        // cannot report voice as ready while the load is still failing.
        if (!io.github.sami_gor.daymark.tts.NativeLibraryState.ensureLoaded()) {
            String reason = io.github.sami_gor.daymark.tts.NativeLibraryState.failureReason();
            state = LocalTtsEngine.State.ERROR;
            lastFailureReason = reason == null ? "native-unavailable" : reason;
            Log.e(TAG, "load: native library unavailable: " + lastFailureReason);
            return;
        }
        try {
            engine = new KokoroLocalTtsEngine(context);
            voiceFlow = new io.github.sami_gor.daymark.packs.VoiceRegistrationFlow(
                    new io.github.sami_gor.daymark.packs.VoiceActivationCoordinator.Registrar() {
                        @Override
                        public void register(final String voiceId,
                                final io.github.sami_gor.daymark.packs.VoiceActivationCoordinator
                                        .RegistrationCallback callback) {
                            engine.registerVoice(voiceId,
                                    new KokoroLocalTtsEngine.VoiceOperationResult() {
                                        @Override
                                        public void onSuccess(java.util.Set<String> installed) {
                                            callback.onRegistered(installed);
                                        }

                                        @Override
                                        public void onError(String code) {
                                            callback.onFailed(code);
                                        }
                                    });
                        }
                    });
            engine.initialize(this);
        } catch (Throwable failure) {
            // A missing or incompatible optional voice library must never take
            // the app down: record the failure, report voice as unavailable and
            // let weather/text stay fully usable.
            engine = null;
            state = LocalTtsEngine.State.ERROR;
            lastFailureReason = "native-unavailable";
            Log.e(TAG, "load: voice engine unavailable: " + failure.getMessage(), failure);
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        boolean available = engine != null && state != LocalTtsEngine.State.ERROR;
        result.put("available", available);
        result.put("reason", available ? "" : (lastFailureReason.isEmpty() ? "native-unavailable" : lastFailureReason));
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", mapState(state));
        call.resolve(result);
    }

    @PluginMethod
    public void getInstalledVoices(PluginCall call) {
        if (engine == null) {
            call.reject("native-unavailable");
            return;
        }
        JSObject result = new JSObject();
        result.put("voices", voiceArray(engine.installedOptionalVoices()));
        call.resolve(result);
    }

    @PluginMethod
    public void getVoiceStates(PluginCall call) {
        JSObject result = new JSObject();
        JSObject states = new JSObject();
        if (voiceFlow != null) {
            for (java.util.Map.Entry<String, String> entry : voiceFlow.states().entrySet()) {
                states.put(entry.getKey(), entry.getValue());
            }
        }
        result.put("states", states);
        call.resolve(result);
    }

    /**
     * Registers a voice file the pack manager has already verified and installed.
     * The engine reloads its native voice set and reports the resulting list.
     */
    @PluginMethod
    public void registerVoice(PluginCall call) {
        reloadForVoice(call);
    }

    /** Activation is the same guarded reload: the voice must already be installed. */
    @PluginMethod
    public void activateVoice(PluginCall call) {
        reloadForVoice(call);
    }

    private void reloadForVoice(PluginCall call) {
        String voiceId = call.getString("voiceId");
        if (voiceId == null || voiceId.trim().isEmpty()) {
            call.reject("invalid-voice");
            return;
        }
        if (engine == null || voiceFlow == null) {
            call.reject("native-unavailable");
            return;
        }
        final String id = voiceId.trim();
        // The pack manager installed and verified the file before calling in;
        // record that, then ask the runtime to load it.
        voiceFlow.installVerified(id);
        voiceFlow.activate(id, new io.github.sami_gor.daymark.packs
                .VoiceRegistrationFlow.Result() {
            @Override
            public void onResult(boolean ready, String error,
                    java.util.Map<String, String> states) {
                if (!ready) {
                    call.reject(error == null || error.isEmpty() ? "registration-failed" : error);
                    return;
                }
                JSObject result = new JSObject();
                JSObject stateMap = new JSObject();
                for (java.util.Map.Entry<String, String> entry : states.entrySet()) {
                    stateMap.put(entry.getKey(), entry.getValue());
                }
                result.put("states", stateMap);
                result.put("voiceId", id);
                result.put("ready", true);
                call.resolve(result);
            }
        });
    }

    private static JSArray voiceArray(java.util.Set<String> voices) {
        JSArray array = new JSArray();
        for (String voice : voices) {
            array.put(voice);
        }
        return array;
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("text is required");
            return;
        }
        String lang = call.getString("lang");
        if (lang == null || lang.trim().isEmpty()) {
            lang = "en-GB";
        }
        if (engine == null || state == LocalTtsEngine.State.ERROR) {
            call.reject(lastFailureReason.isEmpty() ? "native-unavailable" : lastFailureReason);
            return;
        }
        List<String> segments = readSegments(call);
        resolvePendingSpeak();
        if (state == LocalTtsEngine.State.UNINITIALIZED || state == LocalTtsEngine.State.LOADING) {
            // Wait for READY instead of racing initialization.
            queuedText = text;
            queuedLang = lang;
            queuedSegments = segments;
            pendingSpeak = call;
            scheduleReadyTimeout();
            return;
        }
        pendingSpeak = call;
        requestAudioFocus();
        engine.speak(text, lang, segments);
    }

    private List<String> readSegments(PluginCall call) {
        JSArray array = call.getArray("segments");
        if (array == null) {
            return null;
        }
        try {
            List<String> segments = new ArrayList<>();
            for (Object item : array.toList()) {
                if (item instanceof String) {
                    segments.add((String) item);
                } else {
                    return null;
                }
            }
            return segments.size() > 1 ? segments : null;
        } catch (Exception failure) {
            Log.w(TAG, "speak: ignoring invalid segments: " + failure.getMessage());
            return null;
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        cancelReadyTimeout();
        if (engine != null) {
            engine.stop();
        }
        resolvePendingSpeak();
        abandonAudioFocus();
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    @PluginMethod
    public void isSpeaking(PluginCall call) {
        JSObject result = new JSObject();
        result.put("speaking", engine != null && engine.isSpeaking());
        call.resolve(result);
    }

    @Override
    public void onStateChanged(LocalTtsEngine.State next) {
        state = next;
        JSObject stateEvent = new JSObject();
        stateEvent.put("state", mapState(next));
        notifyListeners("stateChanged", stateEvent);
        if (next == LocalTtsEngine.State.READY && queuedText != null && pendingSpeak != null) {
            String text = queuedText;
            String lang = queuedLang;
            List<String> segments = queuedSegments;
            queuedText = null;
            queuedLang = null;
            queuedSegments = null;
            requestAudioFocus();
            engine.speak(text, lang, segments);
            return;
        }
        if (next == LocalTtsEngine.State.READY || next == LocalTtsEngine.State.STOPPED) {
            cancelReadyTimeout();
            abandonAudioFocus();
            resolvePendingSpeak();
        } else if (next == LocalTtsEngine.State.ERROR) {
            if (lastFailureReason.isEmpty()) {
                lastFailureReason = "model-init-failed";
            }
            cancelReadyTimeout();
            abandonAudioFocus();
            rejectPendingSpeak(lastFailureReason);
        }
    }

    @Override
    public void onError(String message) {
        // The engine reports recoverable synthesis/playback failures as an
        // error followed by READY. Do not pin the plugin in ERROR here, or a
        // failed utterance would make every later utterance impossible.
        lastFailureReason = classifyFailure(message);
        cancelReadyTimeout();
        abandonAudioFocus();
        rejectPendingSpeak(lastFailureReason);
    }

    /** Stable failure classification shared with the web narration UI. */
    static String classifyFailure(String message) {
        if (message == null) {
            return "native-failed";
        }
        String normalized = message.toLowerCase(Locale.ROOT);
        if (normalized.contains("native-unavailable") || normalized.contains("native-blocked")) {
            // Classify before the generic initialization branch so a failed
            // library is reported as such, not as a model-init failure.
            // Both mean the optional voice dependency is unavailable; the
            // distinct cause stays in the log rather than the public code.
            return "native-unavailable";
        }
        if (normalized.contains("unsupported narration language")
                || normalized.contains("unsupported-language")) {
            return "unsupported-language";
        }
        if (normalized.contains("voice-not-loaded")) {
            return "voice-not-loaded";
        }
        if (normalized.contains("voice-rights-unresolved")) {
            return "voice-rights-unresolved";
        }
        if (normalized.contains("integrity")
                || (normalized.contains("asset") && (normalized.contains("invalid")
                || normalized.contains("mismatch")))
                || (normalized.contains("voice") && (normalized.contains("invalid")
                || normalized.contains("missing") || normalized.contains("mismatch")))) {
            return "voice-asset-invalid";
        }
        if (normalized.contains("playback") || normalized.contains("audiotrack")) {
            return "playback-failed";
        }
        if (normalized.contains("synthesis") || normalized.contains("no audio")) {
            return "synthesis-failed";
        }
        if (normalized.contains("initializ")
                || normalized.contains("model load")
                || normalized.contains("model missing")
                || normalized.contains("engine not ready")
                || normalized.contains("engine unavailable")) {
            return "model-init-failed";
        }
        return "native-failed";
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (engine != null && engine.isSpeaking()) {
            engine.stop();
        }
        cancelReadyTimeout();
        resolvePendingSpeak();
        abandonAudioFocus();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        cancelReadyTimeout();
        resolvePendingSpeak();
        abandonAudioFocus();
        if (engine != null) {
            engine.shutdown();
            engine = null;
        }
        state = LocalTtsEngine.State.UNINITIALIZED;
    }

    private void scheduleReadyTimeout() {
        cancelReadyTimeout();
        mainHandler.postDelayed(readyTimeout, READY_TIMEOUT_MS);
    }

    private void cancelReadyTimeout() {
        mainHandler.removeCallbacks(readyTimeout);
    }

    private void resolvePendingSpeak() {
        PluginCall call = pendingSpeak;
        pendingSpeak = null;
        queuedText = null;
        queuedLang = null;
        queuedSegments = null;
        if (call != null) {
            call.resolve();
        }
    }

    private void rejectPendingSpeak(String message) {
        PluginCall call = pendingSpeak;
        pendingSpeak = null;
        queuedText = null;
        queuedLang = null;
        queuedSegments = null;
        if (call != null) {
            call.reject(message);
        }
    }

    private void requestAudioFocus() {
        if (focusHeld || audioManager == null) {
            return;
        }
        AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(this::onAudioFocusChange)
                    .build();
            result = audioManager.requestAudioFocus(focusRequest);
        } else {
            result = audioManager.requestAudioFocus(this::onAudioFocusChange, AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
        focusHeld = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        if (!focusHeld) {
            Log.w(TAG, "audio focus not granted; speaking anyway");
        }
    }

    private void abandonAudioFocus() {
        if (!focusHeld || audioManager == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
        } else {
            audioManager.abandonAudioFocus(this::onAudioFocusChange);
        }
        focusHeld = false;
    }

    private void onAudioFocusChange(int change) {
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            focusHeld = false;
            if (engine != null) {
                engine.stop();
            }
            resolvePendingSpeak();
        } else if (change == AudioManager.AUDIOFOCUS_GAIN) {
            focusHeld = true;
        }
    }

    private static String mapState(LocalTtsEngine.State value) {
        switch (value) {
            case LOADING:
                return "loading";
            case READY:
                return "ready";
            case SPEAKING:
                return "speaking";
            case STOPPED:
                return "stopped";
            case ERROR:
                return "error";
            case UNINITIALIZED:
            default:
                return "uninitialized";
        }
    }
}
