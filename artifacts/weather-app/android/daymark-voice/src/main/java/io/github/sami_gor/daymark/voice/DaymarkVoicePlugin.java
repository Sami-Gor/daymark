package io.github.sami_gor.daymark.voice;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean focusHeld;
    private LocalTtsEngine.State state = LocalTtsEngine.State.UNINITIALIZED;

    private PluginCall pendingSpeak;
    private String queuedText;

    private final Runnable readyTimeout = () -> {
        if (pendingSpeak != null && state != LocalTtsEngine.State.READY && state != LocalTtsEngine.State.STOPPED) {
            PluginCall call = pendingSpeak;
            pendingSpeak = null;
            queuedText = null;
            call.reject("engine not ready in time");
        }
    };

    @Override
    public void load() {
        Context context = getContext();
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        engine = new KokoroLocalTtsEngine(context);
        engine.initialize(this);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", engine != null && state != LocalTtsEngine.State.ERROR);
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", mapState(state));
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("text is required");
            return;
        }
        if (engine == null || state == LocalTtsEngine.State.ERROR) {
            call.reject("native engine unavailable");
            return;
        }
        if (state == LocalTtsEngine.State.UNINITIALIZED || state == LocalTtsEngine.State.LOADING) {
            // Wait for READY instead of racing initialization.
            queuedText = text;
            resolvePendingSpeak();
            pendingSpeak = call;
            scheduleReadyTimeout();
            return;
        }
        resolvePendingSpeak();
        pendingSpeak = call;
        requestAudioFocus();
        engine.speak(text);
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
        if (next == LocalTtsEngine.State.READY && queuedText != null && pendingSpeak != null) {
            String text = queuedText;
            queuedText = null;
            requestAudioFocus();
            engine.speak(text);
            return;
        }
        if (next == LocalTtsEngine.State.READY || next == LocalTtsEngine.State.STOPPED) {
            cancelReadyTimeout();
            abandonAudioFocus();
            resolvePendingSpeak();
        } else if (next == LocalTtsEngine.State.ERROR) {
            cancelReadyTimeout();
            abandonAudioFocus();
            rejectPendingSpeak("native engine error");
        }
    }

    @Override
    public void onError(String message) {
        state = LocalTtsEngine.State.ERROR;
        cancelReadyTimeout();
        abandonAudioFocus();
        rejectPendingSpeak(message == null ? "native engine error" : message);
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
        if (call != null) {
            call.resolve();
        }
    }

    private void rejectPendingSpeak(String message) {
        PluginCall call = pendingSpeak;
        pendingSpeak = null;
        queuedText = null;
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
