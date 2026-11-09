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

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import io.github.sami_gor.daymark.packs.HttpUrlConnectionTransport;
import io.github.sami_gor.daymark.packs.PackDownloader;
import io.github.sami_gor.daymark.packs.PackInstaller;
import io.github.sami_gor.daymark.packs.PackSignatureVerifier;
import io.github.sami_gor.daymark.packs.PackSourceConfig;
import io.github.sami_gor.daymark.packs.VoicePackManager;
import io.github.sami_gor.daymark.packs.VoiceRegistrationFlow;
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
    private VoiceRegistrationFlow voiceFlow;
    /** Orchestrates download → verify → install → activate → register. */
    private VoicePackManager packManager;
    private PackSourceConfig packSource;
    private ExecutorService packExecutor;
    private String packConfigError = "";
    private final Object packLock = new Object();
    private String activePackOperationId;
    private String lastPackProgressKey = "";
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
        // Pack source configuration is compiled into the variant. An empty
        // production configuration fails closed here and never offers a download.
        loadPackSource();
        voiceFlow = createVoiceFlow();
        packExecutor = Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "daymark-pack-install");
            thread.setDaemon(true);
            return thread;
        });
        // Resolve the optional native library synchronously so isAvailable()
        // cannot report voice as ready while the load is still failing.
        if (!io.github.sami_gor.daymark.tts.NativeLibraryState.ensureLoaded()) {
            String reason = io.github.sami_gor.daymark.tts.NativeLibraryState.failureReason();
            state = LocalTtsEngine.State.ERROR;
            lastFailureReason = reason == null ? "native-unavailable" : reason;
            Log.e(TAG, "load: native library unavailable: " + lastFailureReason);
            buildPackManager();
            return;
        }
        try {
            engine = new KokoroLocalTtsEngine(context);
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
        buildPackManager();
    }

    private void loadPackSource() {
        try {
            packSource = PackSourceConfig.fromBuildConfig(
                    BuildConfig.PACK_BASE_URL,
                    BuildConfig.PACK_TRUST_ANCHOR,
                    BuildConfig.PACK_ALLOWED_VOICE_IDS);
            packConfigError = "";
        } catch (PackSourceConfig.ConfigurationException failure) {
            packSource = null;
            packConfigError = failure.reason;
            Log.w(TAG, "load: narration pack source unavailable: " + failure.reason);
        }
    }

    private VoiceRegistrationFlow createVoiceFlow() {
        return new VoiceRegistrationFlow((voiceId, callback) -> {
            KokoroLocalTtsEngine current = engine;
            if (current == null) {
                callback.onFailed("native-unavailable");
                return;
            }
            current.registerVoice(voiceId, new KokoroLocalTtsEngine.VoiceOperationResult() {
                @Override
                public void onSuccess(java.util.Set<String> installed) {
                    callback.onRegistered(installed);
                }

                @Override
                public void onError(String code) {
                    callback.onFailed(code);
                }
            });
        });
    }

    private void buildPackManager() {
        if (packSource == null || voiceFlow == null || packExecutor == null) {
            return;
        }
        try {
            File filesDir = getContext().getFilesDir();
            File voicesDir = new File(filesDir, "kokoro");
            PackInstaller installer = new PackInstaller(filesDir);
            PackDownloader downloader = new PackDownloader(
                    installer,
                    voicesDir,
                    new HttpUrlConnectionTransport(),
                    new PackSignatureVerifier(packSource.trustAnchor()),
                    appVersionCode(),
                    false,
                    PackDownloader.FreeSpace.fileSystem());
            packManager = new VoicePackManager(
                    packSource,
                    installer,
                    voicesDir,
                    downloader,
                    voiceFlow,
                    packExecutor::execute,
                    this::postPackProgress);
        } catch (RuntimeException failure) {
            packManager = null;
            packConfigError = "pack-source-invalid";
            Log.e(TAG, "load: cannot build pack manager: " + failure.getMessage(), failure);
        }
    }

    private long appVersionCode() {
        try {
            return getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0).getLongVersionCode();
        } catch (Exception failure) {
            // A missing package record must not make packs look newer than the
            // app; the smallest positive version keeps minAppVersion checks on.
            return 1L;
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
     * Local metadata for optional narration packs: known download size, licence
     * text, install/readiness state and whether this build has a usable pack
     * source. Never downloads a payload and never touches the network.
     */
    @PluginMethod
    public void getVoicePackInfo(PluginCall call) {
        JSObject result = new JSObject();
        boolean configured = packSource != null && packManager != null;
        result.put("sourceConfigured", configured);
        result.put("nativeAvailable", engine != null);
        if (!configured) {
            result.put("errorCode",
                    packConfigError.isEmpty() ? PackSourceConfig.UNCONFIGURED : packConfigError);
        }
        JSArray voices = new JSArray();
        if (configured) {
            for (VoicePackManager.Info info : packManager.infos()) {
                voices.put(packInfoObject(info));
            }
        }
        result.put("voices", voices);
        call.resolve(result);
    }

    private static JSObject packInfoObject(VoicePackManager.Info info) {
        JSObject voice = new JSObject();
        voice.put("voiceId", info.voiceId);
        voice.put("packId", info.packId);
        voice.put("language", info.language);
        voice.put("sizeBytes", info.sizeBytes);
        voice.put("installedVersion", info.installedVersion);
        voice.put("installed", info.installed);
        voice.put("ready", info.ready);
        voice.put("state", info.state);
        JSObject licence = new JSObject();
        licence.put("spdx", info.licenceSpdx);
        licence.put("name", info.licenceName);
        licence.put("url", info.licenceUrl);
        licence.put("attribution", info.licenceAttribution);
        licence.put("notice", info.licenceNotice);
        voice.put("licence", licence);
        return voice;
    }

    /**
     * Starts a user-initiated pack install. The web layer supplies the voice id
     * (validated against the compiled allow-list) and an optional operation id
     * used to correlate progress events. No URL or file path is accepted.
     */
    @PluginMethod
    public void installVoicePack(PluginCall call) {
        String voiceId = trimmed(call.getString("voiceId"));
        if (voiceId == null) {
            call.reject("invalid-voice");
            return;
        }
        if (engine == null) {
            call.reject("native-unavailable");
            return;
        }
        if (packSource == null || packManager == null) {
            call.reject(packConfigError.isEmpty() ? PackSourceConfig.UNCONFIGURED : packConfigError);
            return;
        }
        if (!packSource.allows(voiceId)) {
            call.reject("unsupported-voice");
            return;
        }
        String requestedOperation = trimmed(call.getString("operationId"));
        String operationId = requestedOperation == null
                ? UUID.randomUUID().toString() : requestedOperation;
        if (!operationId.matches("[A-Za-z0-9._:-]{1,120}")) {
            call.reject("invalid-operation");
            return;
        }
        synchronized (packLock) {
            if (activePackOperationId != null) {
                call.reject("install-in-progress");
                return;
            }
            activePackOperationId = operationId;
            lastPackProgressKey = "";
        }
        String startError = packManager.start(voiceId, operationId, outcome -> {
            mainHandler.post(() -> {
                synchronized (packLock) {
                    if (operationId.equals(activePackOperationId)) {
                        activePackOperationId = null;
                    }
                }
                if (outcome.ready) {
                    JSObject resolved = new JSObject();
                    resolved.put("voiceId", voiceId);
                    resolved.put("operationId", operationId);
                    resolved.put("ready", true);
                    JSObject stateMap = new JSObject();
                    for (java.util.Map.Entry<String, String> entry : outcome.states.entrySet()) {
                        stateMap.put(entry.getKey(), entry.getValue());
                    }
                    resolved.put("states", stateMap);
                    call.resolve(resolved);
                } else {
                    String code = outcome.errorCode.isEmpty()
                            ? "pack-install-failed" : outcome.errorCode;
                    call.reject(code, code);
                }
            });
        });
        if (startError != null) {
            synchronized (packLock) {
                if (operationId.equals(activePackOperationId)) {
                    activePackOperationId = null;
                }
            }
            call.reject(startError);
        }
    }

    /** Cooperative cancellation for the active install, if it is still current. */
    @PluginMethod
    public void cancelVoicePackInstall(PluginCall call) {
        String operationId = trimmed(call.getString("operationId"));
        if (operationId == null || !operationId.matches("[A-Za-z0-9._:-]{1,120}")) {
            call.reject("invalid-operation");
            return;
        }
        boolean cancelled = packManager != null && packManager.cancel(operationId);
        JSObject result = new JSObject();
        result.put("cancelled", cancelled);
        call.resolve(result);
    }

    /**
     * Forwards one progress snapshot. Events are posted to the main thread,
     * scoped to the current operation id, and de-duplicated so a transport that
     * reports the same byte count twice cannot animate the row twice.
     */
    private void postPackProgress(VoicePackManager.Progress progress) {
        mainHandler.post(() -> {
            String key = progress.operationId + "|" + progress.phase.wireName() + "|"
                    + progress.bytesReceived + "|" + progress.totalBytes + "|"
                    + progress.errorCode;
            synchronized (packLock) {
                if (activePackOperationId == null
                        || !activePackOperationId.equals(progress.operationId)) {
                    return;
                }
                if (key.equals(lastPackProgressKey)) {
                    return;
                }
                lastPackProgressKey = key;
            }
            JSObject event = new JSObject();
            event.put("voiceId", progress.voiceId);
            event.put("operationId", progress.operationId);
            event.put("phase", progress.phase.wireName());
            event.put("bytesReceived", progress.bytesReceived);
            event.put("totalBytes", progress.totalBytes);
            if (progress.totalBytes > 0 && progress.percentage >= 0) {
                event.put("percentage", (int) Math.round(progress.percentage));
            }
            event.put("errorCode", progress.errorCode);
            notifyListeners("voicePackProgress", event);
        });
    }

    private static String trimmed(String value) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        return text.isEmpty() ? null : text;
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
        voiceFlow.activate(id, new VoiceRegistrationFlow.Result() {
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
        synchronized (packLock) {
            if (activePackOperationId != null && packManager != null) {
                packManager.cancel(activePackOperationId);
            }
            activePackOperationId = null;
        }
        if (packExecutor != null) {
            packExecutor.shutdownNow();
            packExecutor = null;
        }
        packManager = null;
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
