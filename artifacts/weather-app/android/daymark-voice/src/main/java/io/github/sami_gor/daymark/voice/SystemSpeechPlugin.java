package io.github.sami_gor.daymark.voice;

import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.UUID;

/**
 * Android system TextToSpeech bridge.
 *
 * The Capacitor WebView has no speechSynthesis, so non-English narration
 * (French, Spanish, ...) falls back to the platform TTS engine here. English on
 * Android uses the local Kokoro engine through {@link DaymarkVoicePlugin}.
 */
@CapacitorPlugin(name = "SystemSpeech")
public class SystemSpeechPlugin extends Plugin {

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private TextToSpeech tts;
    private boolean ready;
    private boolean initFailed;
    private volatile boolean speaking;
    private PluginCall pendingSpeak;
    private String pendingText;
    private String pendingLang;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), status -> {
            if (status != TextToSpeech.SUCCESS || tts == null) {
                initFailed = true;
                rejectPending("system tts initialization failed");
                return;
            }
            ready = true;
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    speaking = true;
                }

                @Override
                public void onDone(String utteranceId) {
                    finishSpeaking();
                }

                @Override
                public void onError(String utteranceId) {
                    speaking = false;
                    rejectPending("system tts playback failed");
                }
            });
            if (pendingText != null && pendingSpeak != null) {
                String text = pendingText;
                String lang = pendingLang;
                pendingText = null;
                pendingLang = null;
                startSpeaking(text, lang);
            }
        });
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", tts != null && !initFailed);
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("text is required");
            return;
        }
        String lang = call.getString("lang", "en");
        if (tts == null || initFailed) {
            call.reject("system tts unavailable");
            return;
        }
        resolvePending();
        pendingSpeak = call;
        if (!ready) {
            pendingText = text;
            pendingLang = lang;
            return;
        }
        startSpeaking(text, lang);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) {
            tts.stop();
        }
        speaking = false;
        resolvePending();
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    @PluginMethod
    public void isSpeaking(PluginCall call) {
        JSObject result = new JSObject();
        result.put("speaking", speaking);
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        resolvePending();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        ready = false;
    }

    private void startSpeaking(String text, String lang) {
        int availability = tts.setLanguage(Locale.forLanguageTag(lang));
        if (availability == TextToSpeech.LANG_MISSING_DATA || availability == TextToSpeech.LANG_NOT_SUPPORTED) {
            rejectPending("system tts language not supported");
            return;
        }
        speaking = true;
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, UUID.randomUUID().toString());
    }

    private void finishSpeaking() {
        speaking = false;
        mainHandler.post(this::resolvePending);
    }

    private void resolvePending() {
        PluginCall call = pendingSpeak;
        pendingSpeak = null;
        pendingText = null;
        pendingLang = null;
        if (call != null) {
            call.resolve();
        }
    }

    private void rejectPending(String message) {
        PluginCall call = pendingSpeak;
        pendingSpeak = null;
        pendingText = null;
        pendingLang = null;
        if (call != null) {
            call.reject(message);
        }
    }
}
