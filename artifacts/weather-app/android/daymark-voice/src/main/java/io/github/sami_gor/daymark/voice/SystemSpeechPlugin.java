package io.github.sami_gor.daymark.voice;

import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.Set;
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
        Locale requested = Locale.forLanguageTag(lang == null || lang.trim().isEmpty() ? "en" : lang);
        if (requested.getLanguage().isEmpty()) {
            rejectPending("system-tts-offline-unavailable");
            return;
        }

        Voice voice = findOfflineVoice(requested);
        if (voice == null) {
            // Do not rely on the engine's default voice: it may use the network.
            rejectPending("system-tts-offline-unavailable");
            return;
        }

        try {
            tts.setVoice(voice);
            speaking = true;
            int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, UUID.randomUUID().toString());
            if (result != TextToSpeech.SUCCESS) {
                speaking = false;
                rejectPending("system-tts-offline-unavailable");
            }
        } catch (RuntimeException error) {
            speaking = false;
            rejectPending("system-tts-offline-unavailable");
        }
    }

    /**
     * Select a locally installed voice for the requested language. Prefer an
     * exact region match, then higher quality. Voices flagged as requiring
     * network access or missing installation data are never selected.
     */
    private Voice findOfflineVoice(Locale requested) {
        if (tts == null || android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.LOLLIPOP) {
            return null;
        }
        Set<Voice> voices;
        try {
            voices = tts.getVoices();
        } catch (RuntimeException error) {
            return null;
        }
        if (voices == null) return null;

        Voice best = null;
        int bestRegionMatch = -1;
        int bestQuality = Integer.MIN_VALUE;
        for (Voice candidate : voices) {
            if (candidate == null || candidate.isNetworkConnectionRequired()) continue;
            Locale candidateLocale = candidate.getLocale();
            if (candidateLocale == null || !requested.getLanguage().equals(candidateLocale.getLanguage())) continue;
            if (candidate.getFeatures() != null
                && candidate.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) {
                continue;
            }

            int availability = tts.isLanguageAvailable(candidateLocale);
            if (availability < TextToSpeech.LANG_AVAILABLE) continue;

            int regionMatch = requested.getCountry().equalsIgnoreCase(candidateLocale.getCountry()) ? 1 : 0;
            int quality = candidate.getQuality();
            if (best == null || regionMatch > bestRegionMatch
                || (regionMatch == bestRegionMatch && quality > bestQuality)) {
                best = candidate;
                bestRegionMatch = regionMatch;
                bestQuality = quality;
            }
        }
        return best;
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
