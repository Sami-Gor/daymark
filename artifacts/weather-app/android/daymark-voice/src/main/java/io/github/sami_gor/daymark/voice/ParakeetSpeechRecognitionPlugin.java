package io.github.sami_gor.daymark.voice;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
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
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

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
 *
 * <p>Lifecycle guarantees, enforced by the session bookkeeping and covered by
 * the JVM lifecycle tests:
 *
 * <ul>
 *   <li>the {@code start} call resolves only once the microphone is actually
 *       recording, and is rejected with the capture-specific reason otherwise;
 *   <li>a session emits exactly one terminal outcome ({@code result} or
 *       {@code error}), never a second one after a cancellation; the phase
 *       events ({@code started}, {@code captureEnd}) are dropped for a session
 *       that is no longer live;
 *   <li>the capture device is created, read and released by one worker thread
 *       only, so a cancellation never releases a recorder under a blocked read;
 *   <li>the recogniser is never released while a decode may still be in
 *       flight: destroy waits a bounded time for the worker, and if the wait
 *       is not met the worker itself releases the recogniser when decode
 *       returns.
 * </ul>
 */
@CapacitorPlugin(
    name = "ParakeetSpeechRecognition",
    permissions = @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
)
public class ParakeetSpeechRecognitionPlugin extends Plugin {
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
    /**
     * Upper bound of a single capture read. Bounded reads are what let the
     * 30 s cap fire even when the audio input stalls, and what lets a
     * cancelled session notice the cancellation instead of blocking forever.
     */
    private static final int READ_TIMEOUT_MS = 100;
    /** Root-mean-square amplitude at or above which a chunk counts as speech. */
    private static final float SPEECH_THRESHOLD = 0.02f;
    /** 60 ms of speech needed before the utterance is considered started. */
    private static final int ONSET_CHUNKS = 3;
    /** 1500 ms of quiet needed after speech to end the utterance. */
    private static final int HANGOVER_CHUNKS = 75;
    /** CPU threads used for inference. */
    private static final int NUM_THREADS = 2;
    /**
     * How long destroy waits for the capture worker before leaving the
     * recogniser to the worker's own cleanup. Bounded so the main thread is
     * never held hostage by a long decode.
     */
    private static final long DESTROY_JOIN_TIMEOUT_MS = 2000;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ExecutorService preparation = Executors.newSingleThreadExecutor();
    private final Object stateLock = new Object();

    private Session activeSession;
    private UtteranceDecoder recognizer;
    private boolean modelReady;
    private String unavailableReason = ParakeetModelAssets.REASON_MODEL_PREPARING;
    private boolean released;

    /**
     * Injection point for the capture device, so the capture lifecycle can be
     * driven by JVM tests with a fake device. The default is the real
     * {@link AudioRecord}-backed device.
     */
    volatile Supplier<SpeechCaptureDevice> captureDeviceSupplier =
            () -> new AudioSpeechCaptureDevice(SAMPLE_RATE);

    /** Injection point for the clock used by capture deadlines and durations. */
    volatile LongSupplier clock = SystemClock::elapsedRealtime;

    /** How long {@link #handleOnDestroy()} waits for the worker; overridable by tests. */
    volatile long destroyJoinTimeoutMs = DESTROY_JOIN_TIMEOUT_MS;

    /** Resolves or rejects the {@code start} call of a session. */
    interface StartCallback {
        void onSuccess();
        void onFailure(String code);
    }

    /** One capture session. */
    private static final class Session {
        final int id;
        final StartCallback start;
        final AtomicBoolean cancelled = new AtomicBoolean(false);
        /** Exactly-one-terminal-outcome guard: result or error, never both. */
        final AtomicBoolean terminal = new AtomicBoolean(false);
        /** Exactly-once guard for the start call. */
        final AtomicBoolean startSettled = new AtomicBoolean(false);
        /** Published by the worker once the microphone is live; worker-owned. */
        volatile SpeechCaptureDevice device;

        Session(int id, StartCallback start) {
            this.id = id;
            this.start = start;
        }

        void settleSuccess() {
            if (startSettled.compareAndSet(false, true)) {
                start.onSuccess();
            }
        }

        void settleFailure(String code) {
            if (startSettled.compareAndSet(false, true)) {
                start.onFailure(code);
            }
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
        // purposes even though the microphone has not been created yet.
        cancelSession(sessionId);
        call.resolve();
    }

    /**
     * Cancels the session with the given id (any session when negative).
     * Package-private seam so JVM tests can cancel without a PluginCall.
     *
     * <p>The capture device is deliberately not touched here: it is owned by
     * the worker, whose reads are bounded, so the worker notices the
     * cancellation and releases the device itself. Releasing a recorder from
     * this thread while a read is in flight is what used to produce a second
     * terminal error for the same session.
     *
     * @return whether a live session was aborted
     */
    boolean cancelSession(int sessionId) {
        cancelPendingPermission(sessionId, "aborted");
        Session session;
        synchronized (stateLock) {
            session = activeSession;
            if (session == null || (sessionId >= 0 && session.id != sessionId)) {
                return false;
            }
            activeSession = null;
        }
        session.cancelled.set(true);
        finishWithError(session, "aborted");
        return true;
    }

    private void beginCapture(PluginCall call, int sessionId) {
        beginSession(sessionId, new StartCallback() {
            @Override
            public void onSuccess() {
                call.resolve();
            }

            @Override
            public void onFailure(String code) {
                call.reject(code);
            }
        });
    }

    /**
     * Begins a capture session and submits the capture task to the worker.
     * Package-private seam so JVM tests can begin sessions with a recording
     * start callback instead of a PluginCall.
     *
     * @return the session, or null after settling {@code start} with the
     *         rejection code
     */
    Session beginSession(int sessionId, StartCallback start) {
        final Session session = new Session(sessionId, start);
        synchronized (stateLock) {
            if (released) {
                session.settleFailure("offline-unavailable");
                return null;
            }
            if (activeSession != null) {
                session.settleFailure("session-busy");
                return null;
            }
            activeSession = session;
        }
        try {
            worker.execute(() -> captureAndRecognize(session));
        } catch (RuntimeException executorRejected) {
            // Destroy raced this start between the session check and the
            // submit: fail the call instead of leaving a session that can
            // never produce an outcome.
            synchronized (stateLock) {
                if (activeSession == session) {
                    activeSession = null;
                }
            }
            session.cancelled.set(true);
            session.settleFailure("offline-unavailable");
            return null;
        }
        return session;
    }

    private void captureAndRecognize(Session session) {
        UtteranceDecoder engine;
        synchronized (stateLock) {
            if (activeSession != session || session.cancelled.get()) {
                // The session was cancelled before this task ran; its single
                // terminal outcome has already been emitted by cancel().
                return;
            }
            engine = recognizer;
        }
        if (engine == null) {
            finishWithError(session, "offline-unavailable");
            return;
        }

        final SampleBuffer samples = new SampleBuffer();
        SpeechCaptureDevice device = null;
        try {
            device = captureDeviceSupplier.get();

            if (!sessionIsCurrent(session)) {
                // Cancelled before the recorder was created: emit nothing
                // further, the device is released below.
                return;
            }

            final boolean recording;
            try {
                recording = device.start();
            } catch (SecurityException permissionLost) {
                finishWithError(session, "not-allowed");
                return;
            }
            if (!recording) {
                // The device reports construction, start or recording-state
                // failure: a microphone fault, not a model fault.
                finishWithError(session, "audio-capture");
                return;
            }
            if (!publishDeviceAndAnnounceStart(session, device)) {
                // Cancelled while the recorder was being created. Release the
                // local device (below) and emit nothing further: cancel() has
                // already produced the session's single terminal outcome.
                return;
            }

            final long captureStartMs = clock.getAsLong();
            SpeechEndpointDetector detector =
                    new SpeechEndpointDetector(SPEECH_THRESHOLD, ONSET_CHUNKS, HANGOVER_CHUNKS);
            short[] chunk = new short[CHUNK_SAMPLES];
            long deadline = clock.getAsLong() + MAX_CAPTURE_MS;
            boolean reachedLimit = false;

            while (!session.cancelled.get()) {
                // Bounded read: a stalled input can never hold this loop
                // hostage, and the deadline below stays enforceable.
                int read = device.read(chunk, READ_TIMEOUT_MS);
                if (read < 0) {
                    if (session.cancelled.get() || session.terminal.get()) {
                        // The session already has its terminal outcome (for
                        // example the abort that made this read fail); a dead
                        // read on an abandoned device is not a second outcome.
                        return;
                    }
                    // Includes ERROR_DEAD_OBJECT and other read errors after a
                    // started recorder.
                    finishWithError(session, "audio-capture");
                    return;
                }
                if (read > 0) {
                    samples.append(chunk, read);
                    if (detector.accept(rootMeanSquare(chunk, read))) {
                        break;
                    }
                }
                if (clock.getAsLong() >= deadline) {
                    reachedLimit = true;
                    break;
                }
            }

            if (session.cancelled.get()) {
                // cancel()/destroy already emitted the single aborted event for
                // this session; no captureEnd and no second error here.
                samples.clear();
                return;
            }

            final long capturedMs = Math.max(0L, clock.getAsLong() - captureStartMs);
            // The microphone is no longer needed; free it before the decode.
            // release() is idempotent, so the finally below is a no-op.
            device.release();
            emitCaptureEndIfLive(session, capturedMs);

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

            final String text = engine.decode(samples.toArray(), SAMPLE_RATE);
            samples.clear();

            if (text == null || text.trim().isEmpty()) {
                finishWithError(session, "no-speech");
                return;
            }
            finishWithResult(session, text.trim());
        } catch (SecurityException notAllowed) {
            finishWithError(session, "not-allowed");
        } catch (Throwable error) {
            finishWithError(session, "offline-unavailable");
        } finally {
            if (device != null) {
                // The single owner releases the device on every path, so the
                // microphone can never leak and release never races a read.
                device.release();
            }
            samples.clear();
            releaseRecognizerIfOrphaned();
        }
    }

    /** Whether the session is still the live one and has not been cancelled. */
    private boolean sessionIsCurrent(Session session) {
        synchronized (stateLock) {
            return activeSession == session && !session.cancelled.get();
        }
    }

    /**
     * Re-checks the session after the recorder was created and only then
     * publishes the device and announces the start. Emitting inside the lock is
     * what makes the guard airtight: no terminal event for this session can be
     * emitted between the check and the {@code started} event.
     *
     * @return false when the session was cancelled in the creation window; the
     *         caller must then release the local device and emit nothing
     */
    private boolean publishDeviceAndAnnounceStart(Session session, SpeechCaptureDevice device) {
        synchronized (stateLock) {
            if (activeSession != session || session.cancelled.get() || session.terminal.get()) {
                return false;
            }
            session.device = device;
            notifyStarted(session.id);
            // The start call resolves only now that the microphone is live.
            session.settleSuccess();
        }
        return true;
    }

    /**
     * Emits the capture-end phase event with the captured duration. Only for a
     * live session: a cancelled session never sees a captureEnd after its
     * terminal event.
     */
    private void emitCaptureEndIfLive(Session session, long capturedMs) {
        synchronized (stateLock) {
            if (activeSession != session || session.cancelled.get() || session.terminal.get()) {
                return;
            }
            notifyCaptureEnd(session.id, capturedMs);
        }
    }

    /**
     * The session's terminal error. Guarded by the session's terminal flag so
     * only one terminal outcome is ever emitted, whichever of cancel, destroy or
     * the worker gets here first.
     */
    private void finishWithError(Session session, String code) {
        synchronized (stateLock) {
            if (activeSession == session) {
                activeSession = null;
            }
            if (!session.terminal.compareAndSet(false, true)) {
                return;
            }
            notifyError(session.id, code);
            // The start call is settled last so the terminal event, which
            // carries the exact code, is what the web layer sees first.
            session.settleFailure(code);
        }
    }

    /** The session's terminal result; a stale transcript is dropped. */
    private void finishWithResult(Session session, String transcript) {
        synchronized (stateLock) {
            if (activeSession != session) {
                // The session was cancelled while decoding. Whoever removed it
                // emits (or has already emitted) the single terminal outcome;
                // do not deliver a stale transcript and do not add a second
                // outcome here.
                return;
            }
            activeSession = null;
            if (!session.terminal.compareAndSet(false, true)) {
                return;
            }
            session.settleSuccess();
            notifyResult(session.id, transcript);
        }
    }

    // ------------------------------------------------------------------
    // Event seams.
    //
    // Package-private emitters that build the exact bridge payloads the web
    // layer has always received. They are deliberately overridable: the JVM
    // lifecycle tests subclass the plugin and record these calls instead of a
    // Capacitor bridge. The payloads are unchanged except for the additive
    // capturedMs on captureEnd.
    //
    // The `end` event is no longer emitted after `result`: `result` is the
    // session's single terminal outcome, and the web layer already derives
    // onEnd from it.
    // ------------------------------------------------------------------

    void notifyStarted(int sessionId) {
        JSObject event = new JSObject();
        event.put("sessionId", sessionId);
        notifyListeners("started", event);
    }

    void notifyCaptureEnd(int sessionId, long capturedMs) {
        JSObject event = new JSObject();
        event.put("sessionId", sessionId);
        event.put("capturedMs", capturedMs);
        notifyListeners("captureEnd", event);
    }

    void notifyResult(int sessionId, String transcript) {
        JSObject event = new JSObject();
        event.put("sessionId", sessionId);
        event.put("transcript", transcript);
        notifyListeners("result", event);
    }

    void notifyError(int sessionId, String code) {
        JSObject event = new JSObject();
        event.put("sessionId", sessionId);
        event.put("code", code);
        notifyListeners("error", event);
    }

    // ------------------------------------------------------------------
    // Model preparation.
    // ------------------------------------------------------------------

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
            synchronized (stateLock) {
                if (released) {
                    return;
                }
            }
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
                // The build can complete after the plugin was released (the
                // activity was destroyed during the first-run copy);
                // installRecognizer re-checks and discards instead of
                // publishing a recogniser that would never be freed.
                installRecognizer(new SherpaUtteranceDecoder(buildRecognizer()));
            } catch (Throwable error) {
                Log.e(TAG, "prepareModel failed", error);
                synchronized (stateLock) {
                    modelReady = false;
                    unavailableReason = ParakeetModelAssets.REASON_RUNTIME_UNAVAILABLE;
                }
            }
        });
    }

    /**
     * Publishes a recogniser that has just finished building. Package-private
     * seam so JVM tests can drive the completed-after-release moment directly.
     *
     * <p>A build that completes after the plugin was released is discarded and
     * freed here instead of being installed: installing it would leave a live
     * native recogniser nobody will ever release, and would report the plugin
     * as available after destroy.
     */
    void installRecognizer(UtteranceDecoder built) {
        boolean accept;
        synchronized (stateLock) {
            accept = !released;
            if (accept) {
                recognizer = built;
                modelReady = true;
                unavailableReason = "";
            }
        }
        if (!accept) {
            try {
                built.release();
            } catch (Throwable ignored) {
                // Nothing useful to do while cleaning up.
            }
        }
    }

    /** Whether a recogniser is currently installed. Test seam. */
    boolean hasRecognizer() {
        synchronized (stateLock) {
            return recognizer != null;
        }
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

    /**
     * The production {@link UtteranceDecoder}: one sherpa stream per utterance,
     * decoded and read back exactly as before, released on every path.
     */
    private static final class SherpaUtteranceDecoder implements UtteranceDecoder {
        private final OfflineRecognizer engine;
        private final AtomicBoolean released = new AtomicBoolean(false);

        SherpaUtteranceDecoder(OfflineRecognizer engine) {
            this.engine = engine;
        }

        @Override
        public String decode(float[] samples, int sampleRate) {
            OfflineStream stream = null;
            try {
                // A fresh stream per utterance, as the evaluated configuration used.
                stream = engine.createStream();
                stream.acceptWaveform(samples, sampleRate);
                engine.decode(stream);
                String text = engine.getResult(stream).getText();
                return text == null ? "" : text;
            } finally {
                if (stream != null) {
                    try {
                        stream.release();
                    } catch (Throwable ignored) {
                        // Nothing useful to do while cleaning up.
                    }
                }
            }
        }

        @Override
        public void release() {
            if (!released.compareAndSet(false, true)) {
                return;
            }
            try {
                engine.release();
            } catch (Throwable ignored) {
                // Nothing useful to do while cleaning up.
            }
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

    // ------------------------------------------------------------------
    // Activity lifecycle.
    // ------------------------------------------------------------------

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
        boolean workerQuiet = false;
        try {
            // Never release the recogniser while the worker may still be inside
            // decode(): wait a bounded time for the worker first.
            workerQuiet = worker.awaitTermination(destroyJoinTimeoutMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
        if (workerQuiet) {
            releaseRecognizer();
        }
        // If the worker did not finish in time it is still decoding; its own
        // cleanup releases the recogniser once decode returns, so release()
        // never races an in-flight decode. Idempotent on repeated destroy.
        super.handleOnDestroy();
    }

    /** Aborts the active session, if any. Phase-safe: the device stays worker-owned. */
    private void abortActiveSession() {
        Session session;
        synchronized (stateLock) {
            session = activeSession;
            if (session == null) {
                return;
            }
            activeSession = null;
        }
        session.cancelled.set(true);
        finishWithError(session, "aborted");
    }

    /**
     * Releases the installed recogniser, if any. Called by destroy once the
     * worker is quiet, and by the worker itself when destroy could not wait
     * for it.
     */
    private void releaseRecognizer() {
        UtteranceDecoder engine;
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
    }

    /**
     * Worker-side recogniser cleanup for the case where destroy timed out
     * waiting for this worker: the recogniser is released here, after decode
     * has returned, instead of from under the decode.
     */
    private void releaseRecognizerIfOrphaned() {
        UtteranceDecoder engine = null;
        synchronized (stateLock) {
            if (released && recognizer != null) {
                engine = recognizer;
                recognizer = null;
            }
        }
        if (engine != null) {
            try {
                engine.release();
            } catch (Throwable ignored) {
                // Nothing useful to do while cleaning up.
            }
        }
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
