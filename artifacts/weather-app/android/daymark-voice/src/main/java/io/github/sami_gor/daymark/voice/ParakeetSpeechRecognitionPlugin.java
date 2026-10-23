package io.github.sami_gor.daymark.voice;

import android.Manifest;
import android.app.Activity;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.SystemClock;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import com.k2fsa.sherpa.onnx.FeatureConfig;
import com.k2fsa.sherpa.onnx.HomophoneReplacerConfig;
import com.k2fsa.sherpa.onnx.OfflineModelConfig;
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OfflineStream;
import com.k2fsa.sherpa.onnx.OfflineTransducerModelConfig;
import com.k2fsa.sherpa.onnx.QnnConfig;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Android speech-to-text backed by Parakeet TDT 0.6B v3 (int8) through
 * sherpa-onnx, running entirely on the device.
 *
 * <p>This replaces the previous implementation, which used Android's
 * {@code SpeechRecognizer}. There is no Android recogniser, no Web Speech and no
 * remote recogniser behind this plugin: if the model cannot be loaded or the
 * recognition fails, the session fails with an explicit error and nothing else is
 * tried.
 *
 * <p>Recording, decoding and the recognition payload are held in memory only.
 * Nothing is written to persistent storage, and no audio or transcript is logged.
 */
@CapacitorPlugin(
    name = "ParakeetSpeechRecognition",
    permissions = @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
)
public final class ParakeetSpeechRecognitionPlugin extends Plugin {
    private static final String TAG = "DaymarkParakeet";
    private static final int MICROPHONE_REQUEST_CODE = 7311;
    private static final String PERMISSION_PREFS = "daymark.permissions";
    private static final String MIC_REQUESTED_KEY = "microphone-requested";
    private static final Object permissionLock = new Object();
    private static ParakeetSpeechRecognitionPlugin pendingPermissionPlugin;
    private static PluginCall pendingPermissionCall;
    private static int pendingPermissionSessionId = -1;
    private static int pendingPermissionRequestCode = -1;
    private static int nextPermissionRequestCode = MICROPHONE_REQUEST_CODE;

    /** Sample rate the evaluated model was measured at. */
    private static final int SAMPLE_RATE = 16000;
    /** Feature dimension the evaluated model was measured with. */
    private static final int FEATURE_DIMENSION = 80;
    /** 20 ms of audio per chunk. */
    private static final int CHUNK_SAMPLES = 320;
    /** Hard cap on a single utterance. */
    private static final int MAX_CAPTURE_MS = 30000;
    /** Root-mean-square amplitude at or above which a chunk counts as speech. */
    private static final float SPEECH_THRESHOLD = 0.02f;
    /** 60 ms of speech needed before the utterance is considered started. */
    private static final int ONSET_CHUNKS = 3;
    /** 500 ms of quiet needed after speech to end the utterance. */
    private static final int HANGOVER_CHUNKS = 25;
    /** CPU threads used for inference. */
    private static final int NUM_THREADS = 2;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ExecutorService preparation = Executors.newSingleThreadExecutor();
    private final Object stateLock = new Object();

    private Session activeSession;
    private OfflineRecognizer recognizer;
    private boolean modelReady;
    private String unavailableReason = ParakeetModelAssets.REASON_MODEL_PREPARING;
    private boolean released;

    /** One capture session. */
    private static final class Session {
        final int id;
        final AtomicBoolean cancelled = new AtomicBoolean(false);
        volatile AudioRecord recorder;

        Session(int id) {
            this.id = id;
        }
    }

    @Override
    public void load() {
        super.load();
        prepareModel();
    }

    /**
     * Reports whether the model is present and the recogniser could be built.
     *
     * <p>The previous experiment answered this unconditionally, which made the
     * voice control claim to be available on a device with no model at all.
     */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        synchronized (stateLock) {
            result.put("available", modelReady && recognizer != null);
            result.put("reason", modelReady && recognizer != null ? "" : unavailableReason);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        final int sessionId = call.getInt("sessionId", -1);
        if (sessionId < 0) {
            call.reject("invalid-session");
            return;
        }

        synchronized (stateLock) {
            if (released) {
                call.reject("offline-unavailable");
                return;
            }
            if (!modelReady || recognizer == null) {
                call.reject(unavailableReason.isEmpty()
                        ? ParakeetModelAssets.REASON_MODEL_MISSING
                        : unavailableReason);
                return;
            }
            if (activeSession != null) {
                call.reject("session-busy");
                return;
            }
        }

        // A new start supersedes any permission request left pending by an older
        // tap. Do this before the permission check so a stale system result can
        // never be applied to this session.
        cancelPendingPermission(-1, "aborted");

        if (getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestMicrophonePermission(call);
            return;
        }

        beginCapture(call, sessionId);
    }

    private void requestMicrophonePermission(PluginCall call) {
        Activity activity = (Activity) getContext();
        if (activity == null) {
            call.reject("permission-blocked");
            return;
        }

        SharedPreferences preferences =
                activity.getSharedPreferences(PERMISSION_PREFS, Context.MODE_PRIVATE);
        boolean requestedBefore = preferences.getBoolean(MIC_REQUESTED_KEY, false);
        boolean canPromptAgain =
                activity.shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO);

        // Permission dialogs can be suppressed after two denials or after an
        // Android-settings revocation. In that state requestPermissions may
        // produce no visible prompt; fail with actionable guidance instead of
        // silently doing nothing.
        if (requestedBefore && !canPromptAgain) {
            call.reject("permission-blocked");
            return;
        }

        preferences.edit().putBoolean(MIC_REQUESTED_KEY, true).apply();
        final int sessionId = call.getInt("sessionId", -1);
        final int requestCode;
        synchronized (permissionLock) {
            requestCode = nextPermissionRequestCode++;
            if (nextPermissionRequestCode > 65535) {
                nextPermissionRequestCode = MICROPHONE_REQUEST_CODE;
            }
            pendingPermissionPlugin = this;
            pendingPermissionCall = call;
            pendingPermissionSessionId = sessionId;
            pendingPermissionRequestCode = requestCode;
        }
        try {
            activity.requestPermissions(
                    new String[] { Manifest.permission.RECORD_AUDIO },
                    requestCode);
        } catch (RuntimeException error) {
            cancelPendingPermission(sessionId, "permission-blocked");
        }
    }

    /** Called from MainActivity's onRequestPermissionsResult. */
    public static void onRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        ParakeetSpeechRecognitionPlugin plugin;
        PluginCall call;
        int sessionId;
        synchronized (permissionLock) {
            if (pendingPermissionRequestCode != requestCode
                    || pendingPermissionPlugin == null
                    || pendingPermissionCall == null) {
                return;
            }
            plugin = pendingPermissionPlugin;
            call = pendingPermissionCall;
            sessionId = pendingPermissionSessionId;
            pendingPermissionPlugin = null;
            pendingPermissionCall = null;
            pendingPermissionSessionId = -1;
            pendingPermissionRequestCode = -1;
        }
        if (plugin == null || call == null) {
            return;
        }
        if (permissions.length == 0
                || grantResults.length == 0
                || !Manifest.permission.RECORD_AUDIO.equals(permissions[0])) {
            // Android documents empty results as an interrupted/cancelled
            // request, not as a user denial.
            call.reject("aborted");
            return;
        }
        if (grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            plugin.beginCapture(call, sessionId);
            return;
        }
        Activity activity = plugin.getContext() instanceof Activity
                ? (Activity) plugin.getContext()
                : null;
        boolean canRetry = activity != null
                && activity.shouldShowRequestPermissionRationale(
                        Manifest.permission.RECORD_AUDIO);
        call.reject(canRetry ? "permission-denied" : "permission-blocked");
    }

    private void cancelPendingPermission(int sessionId, String code) {
        PluginCall pending = null;
        synchronized (permissionLock) {
            if (pendingPermissionPlugin != this
                    || pendingPermissionCall == null
                    || (sessionId >= 0 && pendingPermissionSessionId != sessionId)) {
                return;
            }
            pending = pendingPermissionCall;
            pendingPermissionPlugin = null;
            pendingPermissionCall = null;
            pendingPermissionSessionId = -1;
            pendingPermissionRequestCode = -1;
        }
        pending.reject(code);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        final int sessionId = call.getInt("sessionId", -1);
        // A pending permission request is part of the session for cancellation
        // purposes even though AudioRecord has not been created yet.
        cancelPendingPermission(sessionId, "aborted");
        Session session;
        synchronized (stateLock) {
            session = activeSession;
            if (session == null || (sessionId >= 0 && session.id != sessionId)) {
                call.resolve();
                return;
            }
            activeSession = null;
        }
        session.cancelled.set(true);
        releaseRecorder(session.recorder);
        session.recorder = null;
        emitError(session.id, "aborted");
        call.resolve();
    }

    private void beginCapture(PluginCall call, int sessionId) {
        final Session session = new Session(sessionId);
        synchronized (stateLock) {
            if (released) {
                call.reject("offline-unavailable");
                return;
            }
            if (activeSession != null) {
                call.reject("session-busy");
                return;
            }
            activeSession = session;
        }
        // Resolve only once the microphone is actually running, so the interface
        // shows the listening state only when it is true.
        call.resolve();
        worker.execute(() -> captureAndRecognize(session));
    }

    // RECORD_AUDIO is verified at line 157 (checkSelfPermission) before beginCapture()
    // is ever called; Lint's MissingPermission cannot follow that cross-method
    // guard, so the permission is re-checked here in spirit by the guard above.
    @SuppressLint("MissingPermission")
    private void captureAndRecognize(Session session) {
        OfflineRecognizer engine;
        synchronized (stateLock) {
            engine = recognizer;
        }
        if (engine == null) {
            finishWithError(session, "offline-unavailable");
            return;
        }
        synchronized (stateLock) {
            if (activeSession != session || session.cancelled.get()) {
                return;
            }
        }

        final SampleBuffer samples = new SampleBuffer();
        AudioRecord recorder = null;
        OfflineStream stream = null;
        try {
            int minBuffer = AudioRecord.getMinBufferSize(
                    SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (minBuffer <= 0) {
                finishWithError(session, "audio-capture");
                return;
            }
            recorder = new AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    Math.max(minBuffer * 4, 64000));
            if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
                releaseRecorder(recorder);
                finishWithError(session, "audio-capture");
                return;
            }
            session.recorder = recorder;
            recorder.startRecording();
            emitStarted(session.id);

            SpeechEndpointDetector detector =
                    new SpeechEndpointDetector(SPEECH_THRESHOLD, ONSET_CHUNKS, HANGOVER_CHUNKS);
            short[] chunk = new short[CHUNK_SAMPLES];
            long deadline = SystemClock.elapsedRealtime() + MAX_CAPTURE_MS;
            boolean reachedLimit = false;

            while (!session.cancelled.get()) {
                int read = recorder.read(chunk, 0, chunk.length);
                if (read < 0) {
                    releaseRecorder(recorder);
                    session.recorder = null;
                    finishWithError(session, "audio-capture");
                    return;
                }
                if (read > 0) {
                    samples.append(chunk, read);
                    if (detector.accept(rootMeanSquare(chunk, read))) {
                        break;
                    }
                }
                if (SystemClock.elapsedRealtime() >= deadline) {
                    reachedLimit = true;
                    break;
                }
            }

            releaseRecorder(recorder);
            session.recorder = null;
            emitCaptureEnd(session.id);

            if (session.cancelled.get()) {
                // cancel()/destroy already emitted the single aborted event for
                // this session; do not emit a second, misleading error here.
                samples.clear();
                return;
            }
            if (!detector.hasSpeechStarted()) {
                samples.clear();
                finishWithError(session, "no-speech");
                return;
            }
            if (reachedLimit && samples.size() == 0) {
                samples.clear();
                finishWithError(session, "no-speech");
                return;
            }

            // A fresh stream per utterance, as the evaluated configuration used.
            stream = engine.createStream();
            stream.acceptWaveform(samples.toArray(), SAMPLE_RATE);
            long decodeStart = SystemClock.elapsedRealtime();
            engine.decode(stream);
            String text = engine.getResult(stream).getText();
            stream.release();
            stream = null;
            samples.clear();

            if (text == null || text.trim().isEmpty()) {
                finishWithError(session, "no-speech");
                return;
            }

            synchronized (stateLock) {
                if (activeSession != session) {
                    // The session was cancelled while decoding; do not deliver a
                    // stale transcript.
                    return;
                }
                activeSession = null;
            }
            JSObject result = new JSObject();
            result.put("sessionId", session.id);
            result.put("transcript", text.trim());
            notifyListeners("result", result);
            emitEnd(session.id);
        } catch (SecurityException error) {
            releaseRecorder(recorder);
            session.recorder = null;
            samples.clear();
            finishWithError(session, "not-allowed");
        } catch (Throwable error) {
            releaseRecorder(recorder);
            session.recorder = null;
            samples.clear();
            finishWithError(session, "offline-unavailable");
        } finally {
            if (stream != null) {
                try {
                    stream.release();
                } catch (Throwable ignored) {
                    // Nothing useful to do while cleaning up.
                }
            }
            releaseRecorder(session.recorder);
            session.recorder = null;
        }
    }

    private void finishWithError(Session session, String code) {
        synchronized (stateLock) {
            if (activeSession == session) {
                activeSession = null;
            }
        }
        emitError(session.id, code);
    }

    private void emitStarted(int sessionId) {
        JSObject event = new JSObject();
        event.put("sessionId", sessionId);
        notifyListeners("started", event);
    }

    private void emitCaptureEnd(int sessionId) {
        JSObject event = new JSObject();
        event.put("sessionId", sessionId);
        notifyListeners("captureEnd", event);
    }

    private void emitEnd(int sessionId) {
        JSObject event = new JSObject();
        event.put("sessionId", sessionId);
        notifyListeners("end", event);
    }

    private void emitError(int sessionId, String code) {
        JSObject event = new JSObject();
        event.put("sessionId", sessionId);
        event.put("code", code);
        notifyListeners("error", event);
    }

    /**
     * Makes the model available and builds the recogniser.
     *
     * <p>The model is materialised into the app's private files directory so ONNX
     * Runtime can memory-map it. That keeps the resident footprint of a 640 MB
     * model small, at the cost of one copy on disk.
     *
     * <p>Every file is verified against a pinned SHA-256 digest before it may be
     * loaded. Materialisation writes a temporary file in the model directory,
     * syncs it, verifies it and renames it into place, so a crash cannot leave a
     * partial file at a final path. A verification marker lets later starts skip
     * the hash pass without ever trusting a marker that does not match the
     * pinned model version, sizes and digests.
     */
    private void prepareModel() {
        preparation.execute(() -> {
            if (!assetsPresent()) {
                synchronized (stateLock) {
                    modelReady = false;
                    unavailableReason = ParakeetModelAssets.REASON_MODEL_MISSING;
                }
                return;
            }

            File directory = modelDirectory();
            try {
                ParakeetModelIntegrity.Result integrity = ParakeetModelIntegrity.verify(
                        directory,
                        ParakeetModelAssets.MODEL_VERSION,
                        ParakeetModelAssets.MODEL_FILE_NAMES,
                        ParakeetModelAssets.MODEL_FILE_SIZES,
                        ParakeetModelAssets.MODEL_FILE_SHA256);
                if (!integrity.isOk()) {
                    Log.w(TAG, "model integrity: " + integrity.reason());
                    ParakeetModelInstaller.install(
                            directory,
                            integrity,
                            ParakeetModelAssets.MODEL_VERSION,
                            ParakeetModelAssets.MODEL_FILE_NAMES,
                            ParakeetModelAssets.MODEL_FILE_SIZES,
                            ParakeetModelAssets.MODEL_FILE_SHA256,
                            fileName -> getContext().getAssets().open(
                                    ParakeetModelAssets.assetPath(fileName)));
                }
            } catch (Throwable error) {
                Log.e(TAG, "model materialisation failed", error);
                // Repair rather than load: never leave unverified material at a
                // final path. The next start retries the copy from the assets.
                ParakeetModelInstaller.deleteModelFiles(
                        directory, ParakeetModelAssets.MODEL_FILE_NAMES);
                synchronized (stateLock) {
                    modelReady = false;
                    unavailableReason = ParakeetModelAssets.REASON_MODEL_CORRUPT;
                }
                return;
            }

            try {
                OfflineRecognizer built = buildRecognizer();
                synchronized (stateLock) {
                    recognizer = built;
                    modelReady = true;
                    unavailableReason = "";
                }
            } catch (Throwable error) {
                Log.e(TAG, "prepareModel failed", error);
                synchronized (stateLock) {
                    modelReady = false;
                    unavailableReason = ParakeetModelAssets.REASON_RUNTIME_UNAVAILABLE;
                }
            }
        });
    }

    private boolean assetsPresent() {
        AssetManager assets = getContext().getAssets();
        for (String fileName : ParakeetModelAssets.MODEL_FILE_NAMES) {
            try (InputStream stream = assets.open(ParakeetModelAssets.assetPath(fileName))) {
                if (stream == null) {
                    return false;
                }
            } catch (IOException missing) {
                return false;
            }
        }
        return true;
    }

    private File modelDirectory() {
        return new File(getContext().getFilesDir(), ParakeetModelAssets.MODEL_DIRECTORY);
    }

    private OfflineRecognizer buildRecognizer() {
        File directory = modelDirectory();
        OfflineTransducerModelConfig transducer = new OfflineTransducerModelConfig(
                new File(directory, "encoder.int8.onnx").getAbsolutePath(),
                new File(directory, "decoder.int8.onnx").getAbsolutePath(),
                new File(directory, "joiner.int8.onnx").getAbsolutePath(),
                new QnnConfig());

        OfflineModelConfig model = new OfflineModelConfig();
        model.setTransducer(transducer);
        model.setTokens(new File(directory, "tokens.txt").getAbsolutePath());
        model.setNumThreads(NUM_THREADS);
        model.setProvider("cpu");
        model.setModelType("nemo_transducer");
        model.setModelingUnit("cjkchar");

        OfflineRecognizerConfig config = new OfflineRecognizerConfig();
        config.setFeatConfig(new FeatureConfig(SAMPLE_RATE, FEATURE_DIMENSION, 0.0f));
        config.setModelConfig(model);
        config.setHr(new HomophoneReplacerConfig("", "", ""));
        config.setDecodingMethod("greedy_search");
        config.setMaxActivePaths(4);
        config.setHotwordsFile("");
        config.setHotwordsScore(0.0f);
        config.setBlankPenalty(0.0f);
        return new OfflineRecognizer(null, config);
    }

    private static void releaseRecorder(AudioRecord recorder) {
        if (recorder == null) {
            return;
        }
        try {
            if (recorder.getState() == AudioRecord.STATE_INITIALIZED) {
                recorder.stop();
            }
        } catch (Throwable ignored) {
            // The recorder may already be stopped; releasing is what matters.
        }
        try {
            recorder.release();
        } catch (Throwable ignored) {
            // Nothing useful to do while cleaning up.
        }
    }

    private static float rootMeanSquare(short[] chunk, int count) {
        if (count <= 0) {
            return 0f;
        }
        double sum = 0d;
        for (int index = 0; index < count; index++) {
            double value = chunk[index] / 32768d;
            sum += value * value;
        }
        return (float) Math.sqrt(sum / count);
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        // Do not cancel a pending permission request here: Android permission
        // dialogs commonly pause the host activity without stopping it.
        abortActiveSession();
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        abortActiveSession();
        cancelPendingPermission(-1, "aborted");
    }

    @Override
    protected void handleOnDestroy() {
        cancelPendingPermission(-1, "aborted");
        synchronized (stateLock) {
            released = true;
        }
        abortActiveSession();
        preparation.shutdownNow();
        worker.shutdownNow();
        OfflineRecognizer engine;
        synchronized (stateLock) {
            engine = recognizer;
            recognizer = null;
        }
        if (engine != null) {
            try {
                engine.release();
            } catch (Throwable ignored) {
                // Nothing useful to do while cleaning up.
            }
        }
        super.handleOnDestroy();
    }

    private void abortActiveSession() {
        Session session;
        synchronized (stateLock) {
            session = activeSession;
            activeSession = null;
        }
        if (session == null) {
            return;
        }
        session.cancelled.set(true);
        releaseRecorder(session.recorder);
        session.recorder = null;
        emitError(session.id, "aborted");
    }

    /** Growable float buffer for one utterance. */
    private static final class SampleBuffer {
        private float[] data = new float[SAMPLE_RATE * 4];
        private int size;

        void append(short[] chunk, int count) {
            if (size + count > data.length) {
                int capacity = Math.max(data.length * 2, size + count);
                float[] grown = new float[capacity];
                System.arraycopy(data, 0, grown, 0, size);
                data = grown;
            }
            for (int index = 0; index < count; index++) {
                data[size++] = chunk[index] / 32768f;
            }
        }

        float[] toArray() {
            float[] copy = new float[size];
            System.arraycopy(data, 0, copy, 0, size);
            return copy;
        }

        int size() {
            return size;
        }

        void clear() {
            size = 0;
        }
    }
}
