package io.github.sami_gor.daymark.voice;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Strict on-device speech-to-text bridge for Android.
 *
 * This intentionally uses createOnDeviceSpeechRecognizer() rather than the
 * generic SpeechRecognizer API. Devices without that API or a compatible
 * on-device recognizer report unavailable; there is no online fallback.
 * Audio is held by Android's recognizer only and is never written by Daymark.
 */
@CapacitorPlugin(
    name = "OnDeviceSpeechRecognition",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class OnDeviceSpeechRecognitionPlugin extends Plugin {

    private SpeechRecognizer recognizer;
    private int activeSessionId = -1;
    private int pendingStartSessionId = -1;
    private PluginCall pendingStartCall;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        boolean available = isOnDeviceRecognizerAvailable();
        result.put("available", available);
        result.put("reason", available ? "" :
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.S ? "api-unsupported" : "offline-unavailable"));
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        int sessionId = call.getInt("sessionId", -1);
        if (sessionId < 0) {
            call.reject("invalid-session");
            return;
        }
        if (!isOnDeviceRecognizerAvailable()) {
            call.reject("offline-unavailable");
            return;
        }

        pendingStartSessionId = sessionId;
        pendingStartCall = call;

        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionsCallback");
            return;
        }
        startListening(call, sessionId);
    }

    @PermissionCallback
    private void microphonePermissionsCallback(PluginCall call) {
        int sessionId = call.getInt("sessionId", -1);
        if (sessionId < 0 || pendingStartSessionId != sessionId) {
            // The session was cancelled while the permission prompt was open.
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            clearPendingStart();
            call.reject("microphone-permission-denied");
            return;
        }
        startListening(call, sessionId);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        int sessionId = call.getInt("sessionId", -1);
        boolean cancelAll = sessionId < 0;

        if (cancelAll || pendingStartSessionId == sessionId) {
            PluginCall pending = pendingStartCall;
            clearPendingStart();
            if (pending != null && pending != call) {
                pending.reject("cancelled");
            }
        }

        if (cancelAll || activeSessionId == sessionId) {
            releaseRecognizer(true);
        }

        call.resolve();
    }

    private boolean isOnDeviceRecognizerAvailable() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return false;
        }
        try {
            return SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private void startListening(PluginCall call, int sessionId) {
        if (pendingStartSessionId != sessionId) {
            call.reject("cancelled");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !isOnDeviceRecognizerAvailable()) {
            clearPendingStart();
            call.reject("offline-unavailable");
            return;
        }

        releaseRecognizer(true);
        final SpeechRecognizer next;
        try {
            next = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
        } catch (RuntimeException error) {
            clearPendingStart();
            call.reject("offline-unavailable");
            return;
        }

        recognizer = next;
        activeSessionId = sessionId;
        pendingStartSessionId = -1;
        pendingStartCall = null;

        next.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(android.os.Bundle params) { }

            @Override public void onBeginningOfSpeech() { }

            @Override public void onRmsChanged(float rmsdB) { }

            @Override public void onBufferReceived(byte[] buffer) { }

            @Override public void onEndOfSpeech() { }

            @Override
            public void onError(int error) {
                if (!isCurrent(next, sessionId)) return;
                finishError(next, sessionId, mapRecognitionError(error));
            }

            @Override
            public void onResults(android.os.Bundle results) {
                if (!isCurrent(next, sessionId)) return;
                ArrayList<String> matches = results == null
                    ? null
                    : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String transcript = matches == null || matches.isEmpty() ? "" : matches.get(0);
                if (transcript == null || transcript.trim().isEmpty()) {
                    finishError(next, sessionId, "no-speech");
                    return;
                }

                JSObject result = new JSObject();
                result.put("sessionId", sessionId);
                result.put("transcript", transcript);
                notifyListeners("result", result);
                finishSuccess(next, sessionId);
            }

            @Override public void onPartialResults(android.os.Bundle partialResults) { }

            @Override public void onEvent(int eventType, android.os.Bundle params) { }
        });

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "en-GB"));
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

        try {
            next.startListening(intent);
            call.resolve();
        } catch (SecurityException error) {
            finishError(next, sessionId, "microphone-permission-denied");
            call.reject("microphone-permission-denied");
        } catch (RuntimeException error) {
            finishError(next, sessionId, "offline-unavailable");
            call.reject("offline-unavailable");
        }
    }

    private boolean isCurrent(SpeechRecognizer instance, int sessionId) {
        return recognizer == instance && activeSessionId == sessionId;
    }

    private void finishSuccess(SpeechRecognizer instance, int sessionId) {
        if (!isCurrent(instance, sessionId)) return;
        activeSessionId = -1;
        recognizer = null;
        destroy(instance, false);
        JSObject event = new JSObject();
        event.put("sessionId", sessionId);
        notifyListeners("end", event);
    }

    private void finishError(SpeechRecognizer instance, int sessionId, String code) {
        if (!isCurrent(instance, sessionId)) return;
        activeSessionId = -1;
        recognizer = null;
        destroy(instance, true);
        JSObject event = new JSObject();
        event.put("sessionId", sessionId);
        event.put("code", code);
        notifyListeners("error", event);
    }

    private String mapRecognitionError(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio-capture";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "microphone-permission-denied";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "no-speech";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
            case SpeechRecognizer.ERROR_SERVER_DISCONNECTED:
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
            case SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT:
                // A local service/model error is terminal. Never retry through a generic recognizer.
                return "offline-unavailable";
            default:
                return "unknown";
        }
    }

    private void releaseRecognizer(boolean cancel) {
        SpeechRecognizer current = recognizer;
        recognizer = null;
        activeSessionId = -1;
        if (current != null) {
            destroy(current, cancel);
        }
    }

    private void destroy(SpeechRecognizer instance, boolean cancel) {
        try {
            if (cancel) instance.cancel();
        } catch (RuntimeException ignored) {
            // Cleanup remains best-effort if the recognition service has died.
        }
        try {
            instance.setRecognitionListener(null);
            instance.destroy();
        } catch (RuntimeException ignored) {
            // Do not retain a recognizer if the vendor implementation is faulty.
        }
    }

    private void clearPendingStart() {
        pendingStartSessionId = -1;
        pendingStartCall = null;
    }

    @Override
    protected void handleOnDestroy() {
        PluginCall pending = pendingStartCall;
        clearPendingStart();
        if (pending != null) {
            pending.reject("cancelled");
        }
        releaseRecognizer(true);
        super.handleOnDestroy();
    }
}
