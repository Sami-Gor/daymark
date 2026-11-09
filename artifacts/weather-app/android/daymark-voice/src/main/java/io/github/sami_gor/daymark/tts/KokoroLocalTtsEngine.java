package io.github.sami_gor.daymark.tts;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

import io.github.sami_gor.daymark.voice.BuildConfig;

/**
 * Kokoro (pguso/kokoro) implementation of {@link LocalTtsEngine}.
 *
 * <p>The 92 MB quantized model and the English, French and Latin American
 * Spanish voice packs ship as APK assets; on first initialization they are
 * copied into the app's files directory because Kokoro loads them from paths.
 * Synthesis runs through a minimal Rust JNI bridge (libkokoro_jni.so) with
 * ONNX Runtime statically linked; nothing is downloaded at runtime.
 *
 * <p>English keeps the existing bm_fable/Misaki path. French and Spanish use
 * piper-plus-g2p 0.5.3 and the ff_siwis/em_alex voice packs. That is a debug
 * POC only: release builds compile {@code MULTILINGUAL_NARRATION = false},
 * materialise only bm_fable and reject French/Spanish before synthesis.
 *
 * <p>Lifecycle contract: the engine exposes exactly one state machine through
 * {@link LocalTtsEngine.State}. A voice registration is observable as
 * {@code LOADING} and only becomes {@code READY} after the native engine
 * initialised the requested voice and the ownership generation was committed.
 * A failed reload either restores the previously loaded voice ({@code READY},
 * callback {@code reload-failed}) or ends in {@code ERROR}
 * ({@code reload-failed-unrecovered}); it never stays silently {@code READY}.
 * {@link #loadedVoices()} only ever contains voices a committed native
 * initialisation actually loaded, never merely installed files.
 *
 * <p>For JVM tests every platform dependency is injectable through the
 * package-private constructor: scheduling, native bridge, packaged assets,
 * audio output, logging and the clock.
 */
public final class KokoroLocalTtsEngine implements LocalTtsEngine {

    private static final String TAG = "DaymarkKokoroTts";
    private static final String DEFAULT_VOICE_NAME = NarrationVoicePolicy.ENGLISH_VOICE;
    private static final String LEGACY_VOICE_FILE = "bm_george.bin";
    private static final String MODEL_ASSET = "kokoro/model_quantized.onnx";
    private static final String VOICE_ASSET_PREFIX = "kokoro/";
    private static final int SAMPLE_RATE = 24000;
    private static final float SILENCE_THRESHOLD = 0.004f;
    private static final int FIRST_CHUNK_TRIM_CAP_MS = 300;
    private static final int SEGMENT_LEAD_KEEP_MS = 100;
    private static final int SEGMENT_TRIM_CAP_MS = 600;
    /** Pinned size/digest of the packaged model (also checked by the fetch script). */
    private static final long MODEL_BYTES = 92_361_116L;
    private static final String MODEL_SHA256 =
            "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478";
    private static final long VOICE_BYTES = 522_240L;

    /* ------------------------------------------------------------------ *
     * Platform seams (package-private; production implementations below). *
     * ------------------------------------------------------------------ */

    /** Serialises engine work off the UI thread and listeners onto it. */
    interface Scheduler {
        /** @return false when the worker has been shut down. */
        boolean postWorker(Runnable task);

        void postMain(Runnable task);

        /** Stops accepting new worker tasks; queued tasks still drain. */
        void quitWorker();
    }

    /** The native Kokoro bridge; instrumented deterministically in tests. */
    interface NativeApi {
        boolean ensureLoaded();

        String failureReason();

        String init(String modelPath, String voicesPath, String voiceName);

        float[] synth(String text, String lang, String voiceName);

        String streamStart(String text, String lang, String voiceName);

        void streamPush(String text);

        void streamFinish();

        float[] streamNext();

        void streamClear();

        void release();
    }

    /** Materialised packaged model/voices (verified before first use). */
    interface PackagedAssets {
        File filesDir();

        File voicesDir();

        File modelFile() throws Exception;

        void ensureVoice(String voiceName) throws Exception;
    }

    /** Creates one playback sink; production uses AudioTrack. */
    interface AudioFactory {
        AudioHandle open();
    }

    interface AudioHandle {
        void play();

        int write(short[] buffer, int offset, int size);

        boolean isPlaying();

        void pause();

        void flush();

        long playbackHeadPosition();

        void stop();

        void release();
    }

    interface LogSink {
        void i(String message);

        void w(String message, Throwable error);

        void e(String message, Throwable error);
    }

    interface Clock {
        long elapsedRealtime();

        void sleep(long millis);
    }

    /* ------------------------------------------------------------------ *
     * Fields                                                              *
     * ------------------------------------------------------------------ */

    private final Scheduler scheduler;
    private final PackagedAssets packagedAssets;
    private final AudioFactory audioFactory;
    private final LogSink log;
    private final Clock clock;
    /** Assigned by the public constructor; tests inject directly. */
    private volatile NativeApi nativeApi;

    private volatile Listener listener;
    private volatile State state = State.UNINITIALIZED;
    private final PlaybackGeneration playbackGeneration = new PlaybackGeneration();
    /** Ownership token for this instance; stale generations must not release. */
    private volatile long generation;
    /** True only after nativeInit succeeded, so release never calls into an unloaded library. */
    private volatile boolean nativeInitialised;
    /**
     * Exactly-once release ownership for the current native engine instance.
     * Guarded by {@link EngineOwnership#NATIVE_LOCK}: every write is made
     * while holding that lock. Set only immediately after a successful
     * {@link NativeApi#init}, because that is the only call that creates a
     * native instance; cleared by {@link #releaseNativeInstanceLocked()}.
     * Stream calls never create or own an engine instance, so the stream paths
     * must never write this flag.
     */
    private boolean nativeInstanceLive;
    /**
     * True while this instance holds the process-wide native operation lease.
     * Guarded by {@link EngineOwnership#NATIVE_LOCK}. The lease is taken before
     * the first synth/stream call of a playback operation and released only
     * after the last native call, so reload/shutdown can drain it before
     * touching the process-global engine.
     */
    private boolean operationActive;
    private volatile AudioHandle audioHandle;
    private int synthesisCount;
    /** Path of the materialised model, retained so the engine can be reloaded. */
    private volatile String modelPath;
    private final ReloadGuard reloadGuard = new ReloadGuard();
    /**
     * Voices the current native generation actually loaded. Derived only from
     * a committed native initialisation, never from files on disk: an
     * installed voice is selectable only after registerVoice reloaded the
     * engine and the generation committed.
     */
    private volatile Set<String> loadedVoices = Collections.emptySet();
    private final AtomicBoolean initializationInFlight = new AtomicBoolean();
    private final AtomicBoolean shuttingDown = new AtomicBoolean();
    /** Guards admission decisions and state transitions made on caller threads. */
    private final Object lifecycleLock = new Object();

    private native String nativeInit(String modelPath, String voicesPath, String voiceName);
    private native float[] nativeSynth(String text, String lang, String voiceName);
    private native String nativeStreamStart(String text, String lang, String voiceName);
    private native void nativeStreamPush(String text);
    private native void nativeStreamFinish();
    private native float[] nativeStreamNext();
    private native void nativeStreamClear();
    private native void nativeRelease();

    private static String voiceSha256(String voiceName) {
        switch (voiceName) {
            case NarrationVoicePolicy.ENGLISH_VOICE:
                return "f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1";
            case NarrationVoicePolicy.FRENCH_VOICE:
                return "a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861";
            case NarrationVoicePolicy.SPANISH_VOICE:
                return "27809e9eafdcbcfff90a3016c697568676531de2a2c39cee29c96c7bd6b83e95";
            default:
                throw new IllegalArgumentException("Unknown narration voice: " + voiceName);
        }
    }

    /** Production wiring: Android handlers, assets, AudioTrack, JNI, clock. */
    public KokoroLocalTtsEngine(Context context) {
        this(new HandlerScheduler(),
                new AndroidPackagedAssets(context.getApplicationContext()),
                new AndroidAudioFactory(),
                null,
                new AndroidLogSink(),
                new AndroidClock());
        this.nativeApi = new AndroidNativeApi(this);
    }

    /** Test wiring: every platform dependency is supplied by the caller. */
    KokoroLocalTtsEngine(
            Scheduler scheduler,
            PackagedAssets packagedAssets,
            AudioFactory audioFactory,
            NativeApi nativeApi,
            LogSink log,
            Clock clock) {
        this.scheduler = scheduler;
        this.packagedAssets = packagedAssets;
        this.audioFactory = audioFactory;
        this.nativeApi = nativeApi;
        this.log = log;
        this.clock = clock;
    }

    /* ------------------------------------------------------------------ *
     * Initialisation                                                      *
     * ------------------------------------------------------------------ */

    @Override
    public void initialize(final Listener newListener) {
        this.listener = newListener;
        final long initGeneration;
        synchronized (lifecycleLock) {
            if (shuttingDown.get()) {
                // The worker/handlers are gone; reporting an error is the only
                // honest outcome. A replacement engine instance is required.
                notifyError("engine-shutdown");
                return;
            }
            if (EngineOwnership.isReleaseUnconfirmed()) {
                // A previous native release threw; the native slots may still
                // hold a half-released engine. No init may run on that state.
                notifyError("Initialization failed: "
                        + EngineOwnership.REASON_RELEASE_UNCONFIRMED);
                setState(State.ERROR);
                return;
            }
            if (state == State.LOADING || state == State.READY
                    || state == State.SPEAKING || state == State.STOPPED) {
                notifyError("operation-conflict");
                return;
            }
            if (state == State.ERROR && generation > 0
                    && EngineOwnership.currentGeneration() != 0
                    && EngineOwnership.currentGeneration() != generation) {
                // Another engine instance already took over; re-initialising
                // here would reserve and steal its native generation.
                notifyError("engine-superseded");
                return;
            }
            if (!initializationInFlight.compareAndSet(false, true)) {
                notifyError("operation-conflict");
                return;
            }
            initGeneration = EngineOwnership.beginInit();
            generation = initGeneration;
            nativeInitialised = false;
            loadedVoices = Collections.emptySet();
            setState(State.LOADING);
        }
        final Runnable task = new Runnable() {
            @Override
            public void run() {
                runInitialize(initGeneration);
            }
        };
        if (!scheduler.postWorker(task)) {
            initializationInFlight.set(false);
            synchronized (lifecycleLock) {
                if (state == State.LOADING) {
                    setState(shuttingDown.get() ? State.UNINITIALIZED : State.ERROR);
                }
            }
        }
    }

    private void runInitialize(final long initGeneration) {
        try {
            if (!isStillWanted(initGeneration)) {
                // A replacement instance reserved a newer generation before
                // this task ran; never leave this instance stuck in LOADING.
                abandonStaleInitialisation(initGeneration);
                return;
            }
            if (!nativeApi.ensureLoaded()) {
                String reason = nativeApi.failureReason();
                log.e("initialize: native library unavailable: " + reason, null);
                // Voice is optional: report a classified failure and leave
                // the rest of the app fully usable.
                notifyError("Initialization failed: "
                        + (reason == null ? NativeLibraryState.REASON_NATIVE_UNAVAILABLE : reason));
                setState(State.ERROR);
                return;
            }
            try {
                long copyStart = clock.elapsedRealtime();
                File modelFile = packagedAssets.modelFile();
                File voicesDir = packagedAssets.voicesDir();
                List<String> voices = NarrationVoicePolicy.packagedVoices(
                        BuildConfig.PACKAGED_MULTILINGUAL_VOICES);
                for (String voice : voices) {
                    packagedAssets.ensureVoice(voice);
                }
                modelPath = modelFile.getAbsolutePath();
                log.i("initialize: assets ready in " + (clock.elapsedRealtime() - copyStart)
                        + "ms modelBytes=" + modelFile.length()
                        + " voices=" + String.join(",", voices));

                initializeNative(initGeneration, modelFile, voicesDir);
            } catch (Throwable failure) {
                log.e("initialize: failed: " + failure.getMessage(), failure);
                if (!shuttingDown.get()) {
                    notifyError("Initialization failed: " + failure.getMessage());
                    setState(State.ERROR);
                }
            }
        } finally {
            initializationInFlight.set(false);
        }
    }

    /**
     * Performs (or resumes) the native half of {@link #initialize}.
     *
     * <p>Called under {@link EngineOwnership#NATIVE_LOCK}. The operation lease
     * is drained before the engine is created: a replacement must never call
     * {@code nativeInit} while an older instance's synth/stream is still on the
     * native stack, because the bridge would replace the process-global engine
     * underneath it. When an operation is still active the same method is
     * queued as a continuation and re-entered by the last operation to finish.
     */
    private void initializeNative(
            final long initGeneration,
            final File modelFile,
            final File voicesDir) {
        final Runnable continuation = new Runnable() {
            @Override
            public void run() {
                initializeNative(initGeneration, modelFile, voicesDir);
            }
        };
        String error = null;
        boolean committed = false;
        boolean stale = false;
        boolean blocked = false;
        long elapsedMs = 0;
        synchronized (EngineOwnership.NATIVE_LOCK) {
            // Re-check under the native lock: a newer reservation must never be
            // overwritten by this slow initialisation.
            if (!isStillWanted(initGeneration)) {
                stale = true;
            } else if (EngineOwnership.isReleaseUnconfirmed()) {
                blocked = true;
            } else if (EngineOwnership.awaitDrain(continuation)) {
                // No native operation is active; the lease stops new ones for
                // this generation because authority already moved on.
                long start = clock.elapsedRealtime();
                error = nativeApi.init(
                        modelFile.getAbsolutePath(),
                        voicesDir.getAbsolutePath(),
                        DEFAULT_VOICE_NAME);
                elapsedMs = clock.elapsedRealtime() - start;
                if (error == null) {
                    // The bridge created a native instance: claim it before any
                    // re-check can release it. This is the only kind of site
                    // allowed to set the ownership flag.
                    nativeInstanceLive = true;
                    // Re-check after the (slow) native call: shutdown may have
                    // started, or a newer generation may have been reserved
                    // while we were inside the bridge.
                    if (shuttingDown.get()
                            || !EngineOwnership.isLatestReservation(initGeneration)) {
                        releaseNativeInstanceLocked();
                        stale = true;
                    } else if (EngineOwnership.commitInit(initGeneration)) {
                        // Ownership is committed only after the native engine
                        // accepted the model/voice, and only if no newer
                        // initialisation reserved the engine meanwhile.
                        nativeInitialised = true;
                        // L1: publish only while shutdown cannot interleave;
                        // shutdown clears loadedVoices under the same lock.
                        if (publishLoadedVoices(
                                Collections.singleton(DEFAULT_VOICE_NAME))) {
                            committed = true;
                        } else {
                            // Shutdown won the commit window: ownership stays
                            // with the shutdown release, but this instance must
                            // never log/publish READY.
                            stale = true;
                        }
                    } else {
                        // Superseded during commit: release the engine we
                        // created; the newer generation will initialise.
                        releaseNativeInstanceLocked();
                        stale = true;
                    }
                }
            } else {
                // Drain pending: the continuation runs from the last operation
                // and must not publish anything until then.
                return;
            }
        }
        if (stale) {
            abandonStaleInitialisation(initGeneration);
            return;
        }
        if (blocked) {
            failClosedReleaseUnconfirmed("initialize");
            return;
        }
        if (error != null) {
            log.e("initialize: failed: " + error, null);
            // Notify before the terminal state so the bridge can preserve the
            // specific asset/model reason for the UI.
            notifyError("Initialization failed: " + error);
            setState(State.ERROR);
            return;
        }
        if (!committed) {
            if (!shuttingDown.get()) {
                log.w("initialize: superseded generation " + initGeneration, null);
                setState(State.ERROR);
            }
            return;
        }
        log.i("initialize: model loaded in " + elapsedMs
                + "ms defaultVoice=" + DEFAULT_VOICE_NAME);
        setState(State.READY);
    }

    /**
     * Refuses work after a native release left the process-global slots in an
     * unknown state. There is deliberately no retry: the bridge has no way to
     * prove the engine is gone.
     */
    private void failClosedReleaseUnconfirmed(String operation) {
        String reason = EngineOwnership.REASON_RELEASE_UNCONFIRMED;
        log.e(operation + ": blocked, native release unconfirmed", null);
        if (!shuttingDown.get()) {
            notifyError(reason);
            setState(State.ERROR);
        }
    }

    /**
     * True when this operation still belongs to the newest reservation and the
     * engine has not started shutting down.
     */
    private boolean isStillWanted(long initGeneration) {
        return !shuttingDown.get() && EngineOwnership.isLatestReservation(initGeneration);
    }

    private void abandonStaleInitialisation(long initGeneration) {
        if (!shuttingDown.get()) {
            log.w("initialize: superseded generation " + initGeneration, null);
            setState(State.ERROR);
        }
    }

    /* ------------------------------------------------------------------ *
     * Voice registration / reload                                         *
     * ------------------------------------------------------------------ */

    /** Callback for asynchronous voice registration/reload. */
    public interface VoiceOperationResult {
        void onSuccess(Set<String> loadedVoices);

        void onError(String code);
    }

    /** Supported optional voices currently present in app-private storage. */
    public Set<String> installedOptionalVoices() {
        return VoiceRegistry.installed(packagedAssets.voicesDir());
    }

    /**
     * Voices loaded by the current native generation. Empty until an
     * initialisation committed; never derived from installed files.
     */
    public Set<String> loadedVoices() {
        return loadedVoices;
    }

    /** True when the voice file is present and readable; does not imply loaded. */
    public boolean isVoiceInstalled(String voiceId) {
        return VoiceRegistry.isInstalled(packagedAssets.voicesDir(), voiceId);
    }

    /**
     * Registers a voice that the pack manager has already verified and installed.
     *
     * <p>The native engine snapshots its voice directory at initialisation, so a
     * newly installed file only becomes usable after a guarded reload. The
     * previously loaded voice is released only once the replacement is about
     * to initialise; a failed reload attempts to restore the previous voice,
     * and the caller always receives an explicit error instead of a silent
     * English fallback.
     */
    public void registerVoice(final String voiceId, final VoiceOperationResult callback) {
        final VoiceOperationResult result = callback == null ? NOOP_CALLBACK : callback;
        final File voicesDir = packagedAssets.voicesDir();
        String reason = VoiceRegistry.unavailableReason(voicesDir, voiceId);
        if (reason != null) {
            result.onError(reason);
            return;
        }
        final String model;
        final String previousVoice;
        final long token;
        final long reloadGeneration;
        synchronized (lifecycleLock) {
            if (shuttingDown.get()) {
                result.onError("engine-shutdown");
                return;
            }
            if (EngineOwnership.isReleaseUnconfirmed()) {
                // The native slots may contain a half-released engine; a reload
                // must not release or initialise on top of that.
                result.onError(EngineOwnership.REASON_RELEASE_UNCONFIRMED);
                return;
            }
            if (state == State.LOADING || state == State.SPEAKING) {
                result.onError("operation-conflict");
                return;
            }
            model = modelPath;
            if (model == null) {
                result.onError("engine-not-ready");
                return;
            }
            if (!EngineOwnership.owns(generation) && !isRecoverableError()) {
                // A different engine instance superseded this one: retrying
                // here would steal the replacement's native engine.
                result.onError(EngineOwnership.currentGeneration() == 0
                        ? "engine-not-ready" : "engine-superseded");
                return;
            }
            previousVoice = singleLoadedVoice();
            token = reloadGuard.tryBegin();
            if (token < 0) {
                result.onError("operation-conflict");
                return;
            }
            reloadGeneration = EngineOwnership.beginInit();
            // The reload is observable through the existing state machine:
            // LOADING until the replacement voice actually committed.
            setState(State.LOADING);
        }
        final Runnable task = new Runnable() {
            @Override
            public void run() {
                runReload(model, voicesDir, voiceId, previousVoice, token, reloadGeneration, result);
            }
        };
        if (!scheduler.postWorker(task)) {
            reloadGuard.finish(token);
            synchronized (lifecycleLock) {
                if (state == State.LOADING) {
                    setState(shuttingDown.get() ? State.UNINITIALIZED : State.ERROR);
                }
            }
            result.onError("engine-shutdown");
        }
    }

    private void runReload(
            final String model,
            final File voicesDir,
            final String voiceId,
            final String previousVoice,
            final long token,
            final long reloadGeneration,
            final VoiceOperationResult callback) {
        ReloadOutcome outcome = new ReloadOutcome();
        synchronized (EngineOwnership.NATIVE_LOCK) {
            if (!mayRunReload(token, reloadGeneration)) {
                // A stale reload must not release, initialise or otherwise
                // touch the native engine a newer generation may own.
                outcome.stale = true;
            } else if (!EngineOwnership.awaitDrain(new Runnable() {
                @Override
                public void run() {
                    runReload(model, voicesDir, voiceId, previousVoice,
                            token, reloadGeneration, callback);
                }
            })) {
                // A native operation from the revoked generation is still on
                // the stack. Defer the whole release/init: re-entered by the
                // last operation to finish, so the global engine is never
                // released or replaced underneath it.
                return;
            } else {
                reloadNativeLocked(model, voicesDir, voiceId, previousVoice,
                        token, reloadGeneration, outcome);
                if (outcome.failure != null && !outcome.recovered) {
                    // No usable engine is loaded; make that ownership state
                    // explicit so a retry can reserve the next generation.
                    if (nativeInitialised || nativeInstanceLive) {
                        try {
                            releaseNativeInstanceLocked();
                        } catch (Throwable ignored) {
                            // Best effort: the bridge already failed.
                        }
                    }
                    nativeInitialised = false;
                    clearLoadedVoices();
                    EngineOwnership.claimRelease(generation);
                }
            }
        }
        boolean current = reloadGuard.isCurrent(token);
        reloadGuard.finish(token);
        if (outcome.stale || !current) {
            // Stale completions never publish READY or clear a newer slot.
            callback.onError(shuttingDown.get() ? "engine-shutdown" : "operation-conflict");
            if (!shuttingDown.get()) {
                setState(State.ERROR);
            }
            return;
        }
        if (shuttingDown.get()) {
            // The voice may have committed, but shutdown owns the release and
            // the bridge must not be told a destroyed engine is ready.
            callback.onError("engine-shutdown");
            return;
        }
        if (outcome.failure != null) {
            setState(outcome.recovered ? State.READY : State.ERROR);
            callback.onError(outcome.failure);
            return;
        }
        if (outcome.loaded == null) {
            // Defensive: a current operation with no committed voice.
            setState(State.ERROR);
            callback.onError("reload-failed-unrecovered");
            return;
        }
        setState(State.READY);
        callback.onSuccess(outcome.loaded);
    }

    /**
     * Runs the release/replace/init sequence for one reload. Caller holds
     * {@link EngineOwnership#NATIVE_LOCK} and has drained the operation lease.
     */
    private void reloadNativeLocked(
            String model,
            File voicesDir,
            String voiceId,
            String previousVoice,
            long token,
            long reloadGeneration,
            ReloadOutcome outcome) {
        if (!mayRunReload(token, reloadGeneration)) {
            outcome.stale = true;
            return;
        }
        if (EngineOwnership.isReleaseUnconfirmed()) {
            outcome.failure = EngineOwnership.REASON_RELEASE_UNCONFIRMED;
            return;
        }
        if (nativeInitialised) {
            releaseNativeInstanceLocked();
            // The release can take a long time and shutdown/a newer instance
            // may have arrived while it was inside the bridge.
            if (!mayRunReload(token, reloadGeneration)) {
                outcome.stale = true;
                return;
            }
            if (EngineOwnership.isReleaseUnconfirmed()) {
                // The old release threw: native state is unknown, so do not
                // init the replacement on top of it (no auto-retry).
                outcome.failure = EngineOwnership.REASON_RELEASE_UNCONFIRMED;
                nativeInitialised = false;
                return;
            }
        }
        try {
            if (installVoiceLocked(model, voicesDir, voiceId, token, reloadGeneration, outcome)) {
                return;
            }
        } catch (Throwable error) {
            log.e("registerVoice: failed: " + error.getMessage(), error);
        }
        if (!mayRunReload(token, reloadGeneration)) {
            outcome.stale = true;
            return;
        }
        if (EngineOwnership.isReleaseUnconfirmed()) {
            outcome.failure = EngineOwnership.REASON_RELEASE_UNCONFIRMED;
            return;
        }
        try {
            // Never leave a released engine without attempting to restore the
            // previously working voice.
            if (installVoiceLocked(model, voicesDir, previousVoice,
                    token, reloadGeneration, outcome)) {
                if (outcome.committed) {
                    outcome.recovered = true;
                    outcome.failure = "reload-failed";
                }
                return;
            }
        } catch (Throwable restoreFailure) {
            log.e("registerVoice: restore failed", restoreFailure);
            nativeInitialised = false;
        }
        outcome.failure = "reload-failed-unrecovered";
        outcome.loaded = null;
    }

    /**
     * Attempts one native init followed by an ownership commit. Caller holds
     * {@link EngineOwnership#NATIVE_LOCK} and has drained the lease.
     *
     * @return true when the outcome is final (committed or superseded); false
     *         when the bridge refused the model/voice, so the caller may try a
     *         recovery init.
     */
    private boolean installVoiceLocked(
            String model,
            File voicesDir,
            String voiceName,
            long token,
            long reloadGeneration,
            ReloadOutcome outcome) {
        String error = nativeApi.init(model, voicesDir.getAbsolutePath(), voiceName);
        if (error != null) {
            log.e("registerVoice: failed: " + error, null);
            return false;
        }
        // A native instance exists again: claim it before any re-check can
        // release it, and commit only while this generation is authoritative.
        nativeInstanceLive = true;
        if (!mayRunReload(token, reloadGeneration)) {
            releaseNativeInstanceLocked();
            outcome.stale = true;
            return true;
        }
        if (!EngineOwnership.commitInit(reloadGeneration)) {
            releaseNativeInstanceLocked();
            outcome.stale = true;
            return true;
        }
        nativeInitialised = true;
        generation = reloadGeneration;
        outcome.committed = true;
        outcome.loaded = Collections.singleton(voiceName);
        // L1: commit and publish under the lifecycle lock so shutdown clears
        // loadedVoices atomically and a stale commit can never repopulate it.
        publishLoadedVoices(outcome.loaded);
        return true;
    }

    /** Outcome of one reload transition; call under NATIVE_LOCK. */
    private static final class ReloadOutcome {
        String failure;
        Set<String> loaded;
        boolean committed;
        boolean recovered;
        boolean stale;
    }

    /**
     * Publishes the voices a committed native generation loaded.
     *
     * <p>L1: the check and the assignment happen under {@code lifecycleLock},
     * which shutdown also holds while it publishes its terminal transition and
     * clears {@code loadedVoices}. A commit that loses that race therefore
     * cannot repopulate the set after shutdown.
     *
     * @return false when shutdown already owns the lifecycle; the caller must
     *         not report success.
     */
    boolean publishLoadedVoices(Set<String> voices) {
        synchronized (lifecycleLock) {
            if (shuttingDown.get()) {
                return false;
            }
            loadedVoices = voices;
            return true;
        }
    }

    /** Clears the loaded set under the same lock shutdown uses. */
    private void clearLoadedVoices() {
        synchronized (lifecycleLock) {
            loadedVoices = Collections.emptySet();
        }
    }

    private String singleLoadedVoice() {
        Set<String> snapshot = loadedVoices;
        if (snapshot.size() == 1) {
            return snapshot.iterator().next();
        }
        return DEFAULT_VOICE_NAME;
    }

    /**
     * A retry is only allowed when this instance still owns the newest
     * generation. After an unrecovered reload the generation is current but
     * unowned (so the same engine may retry); after another instance took over
     * the generation is no longer current and a retry would steal its engine.
     */
    private boolean isRecoverableError() {
        return state == State.ERROR
                && generation > 0
                && EngineOwnership.currentGeneration() == generation;
    }

    /**
     * Whether this reload may still touch the native engine. Call under
     * {@link EngineOwnership#NATIVE_LOCK}; it closes the window between the
     * single-flight token, the ownership reservation and the native call.
     */
    private boolean mayRunReload(long token, long reloadGeneration) {
        return !shuttingDown.get()
                && reloadGuard.isCurrent(token)
                && EngineOwnership.isLatestReservation(reloadGeneration);
    }

    private static final VoiceOperationResult NOOP_CALLBACK = new VoiceOperationResult() {
        @Override
        public void onSuccess(Set<String> loadedVoices) {
        }

        @Override
        public void onError(String code) {
        }
    };

    /* ------------------------------------------------------------------ *
     * Speech playback                                                     *
     * ------------------------------------------------------------------ */

    public void speak(final String text) {
        speak(text, "en-GB", null);
    }

    /**
     * @param lang locale used for voice and phonemisation routing.
     * @param segments optional TTS-only segmentation plan; must concatenate to
     *                 {@code text} exactly, otherwise whole-text synthesis is used.
     */
    @Override
    public void speak(final String text, final String lang, final List<String> segments) {
        final String voice;
        final int playbackToken;
        final long callTimeMs;
        final long opGeneration;
        synchronized (lifecycleLock) {
            if (shuttingDown.get()) {
                notifyError("engine-shutdown");
                return;
            }
            if (EngineOwnership.isReleaseUnconfirmed()) {
                notifyError(EngineOwnership.REASON_RELEASE_UNCONFIRMED);
                return;
            }
            if (state != State.READY && state != State.STOPPED) {
                notifyError("engine not ready");
                return;
            }
            if (!EngineOwnership.owns(generation)) {
                // Another engine instance owns the process-wide native engine;
                // speaking here would use (or release) its generation.
                notifyError("engine-superseded");
                return;
            }
            opGeneration = generation;
            voice = NarrationVoicePolicy.voiceForLanguage(
                    lang, BuildConfig.MULTILINGUAL_NARRATION, installedVoiceNames());
            if (voice == null) {
                notifyError("Unsupported narration language: " + lang);
                return;
            }
            if (!NarrationVoicePolicy.isVoiceDistributable(
                    voice, BuildConfig.SPANISH_VOICE_DISTRIBUTION_APPROVED)) {
                notifyError("voice-rights-unresolved");
                return;
            }
            if (!loadedVoices.contains(voice)) {
                // The file may be installed but the native engine has not loaded it
                // yet; never fall back to English or another voice.
                notifyError("voice-not-loaded");
                return;
            }
            playbackToken = playbackGeneration.begin();
            callTimeMs = clock.elapsedRealtime();
            setState(State.SPEAKING);
        }
        if (!scheduler.postWorker(new Runnable() {
            @Override
            public void run() {
                synthesizeAndPlay(text, lang, voice, segments, callTimeMs,
                        playbackToken, opGeneration);
            }
        })) {
            if (playbackGeneration.isCurrent(playbackToken)) {
                setState(State.ERROR);
            }
        }
    }

    /** Optional voices currently installed in app-private storage. */
    private Set<String> installedVoiceNames() {
        return VoiceRegistry.installed(packagedAssets.voicesDir());
    }

    @Override
    public void stop() {
        stopPlayback();
        if (state == State.SPEAKING) {
            setState(State.STOPPED);
        }
    }

    private void stopPlayback() {
        playbackGeneration.invalidate();
        AudioHandle track = audioHandle;
        if (track != null) {
            try {
                if (track.isPlaying()) {
                    track.pause();
                }
                track.flush();
            } catch (RuntimeException ignored) {
                // Track already released by the playback loop.
            }
        }
    }

    /**
     * Releases the current native instance at most once. Caller must hold
     * {@link EngineOwnership#NATIVE_LOCK}. A stale cleanup path and shutdown
     * can both reach this method; the second call is a no-op, so the native
     * engine is never released twice regardless of JNI idempotency.
     *
     * <p>The ownership claim is spent before the bridge call: if the native
     * release throws, both flags stay cleared, the failure is recorded with
     * {@link LogSink#e} and the release is deliberately not retried. A throw
     * also marks the process-wide release-unconfirmed state, because the
     * process-global native slots may still hold a half-released engine; every
     * later init/synth/stream/registration fails closed from then on. Logging
     * only keeps listener callbacks out of the native lock.
     */
    private void releaseNativeInstanceLocked() {
        nativeInitialised = false;
        if (!nativeInstanceLive) {
            return;
        }
        // Claim exactly-once before entering JNI: even a throw spends the
        // claim, so no later path can release the same instance twice.
        nativeInstanceLive = false;
        // Sole raw native release site; every caller holds NATIVE_LOCK.
        try {
            nativeApi.release();
        } catch (Throwable failure) {
            // Sticky for the process: the global engine/stream slots are now
            // in an unknown state and the bridge cannot prove otherwise.
            EngineOwnership.markReleaseUnconfirmed();
            log.e("releaseNativeInstanceLocked: native release failed; "
                    + "native state unconfirmed, all later native work blocked", failure);
        }
    }

    @Override
    public boolean isSpeaking() {
        return state == State.SPEAKING;
    }

    @Override
    public void shutdown() {
        synchronized (lifecycleLock) {
            // Publish the shutdown decision atomically with admission checks so
            // a concurrent speak/register cannot transition to READY/SPEAKING
            // after the state was set to UNINITIALIZED here.
            if (!shuttingDown.compareAndSet(false, true)) {
                return;
            }
            // L1: clear the loaded set with the terminal transition. A commit
            // that races this either published before (and is cleared here) or
            // observes shuttingDown and refuses to publish.
            loadedVoices = Collections.emptySet();
        }
        reloadGuard.invalidate();
        stopPlayback();
        scheduler.postWorker(new Runnable() {
            @Override
            public void run() {
                runShutdownRelease();
            }
        });
        scheduler.quitWorker();
        setState(State.UNINITIALIZED);
    }

    /**
     * Performs (or resumes) the deferred native release for shutdown.
     *
     * <p>The release waits for every leased native operation to finish: freeing
     * the process-global engine while an old synth/stream call is still on the
     * stack would let that call touch a replacement's slots. There is no
     * timeout that releases anyway; if a native call never returns, the engine
     * simply remains unreleased in a fail-closed state.
     */
    private void runShutdownRelease() {
        try {
            synchronized (EngineOwnership.NATIVE_LOCK) {
                if (!EngineOwnership.awaitDrain(new Runnable() {
                    @Override
                    public void run() {
                        runShutdownRelease();
                    }
                })) {
                    return;
                }
                if (EngineOwnership.isReleaseUnconfirmed()) {
                    // Never retry a release whose outcome is unknown; a later
                    // init/synth/stream is blocked by the same sticky flag.
                    log.w("shutdown: release not retried, native state unconfirmed", null);
                    return;
                }
                // Read the generation when the task runs: an in-flight reload
                // that committed a newer generation just before shutdown must
                // be the one released.
                boolean owned = EngineOwnership.claimRelease(generation);
                if (owned && nativeInitialised) {
                    releaseNativeInstanceLocked();
                } else if (owned) {
                    // A reload already released the native engine before it
                    // was interrupted: only clear ownership.
                    nativeInitialised = false;
                    log.i("shutdown: ownership cleared without a live release");
                } else {
                    log.i("shutdown: skipped release for superseded generation "
                            + generation);
                }
            }
        } catch (Throwable failure) {
            log.w("shutdown: release failed: " + failure.getMessage(), failure);
        }
    }

    private void synthesizeAndPlay(
            String text,
            String lang,
            String voice,
            List<String> segments,
            long callTimeMs,
            int playbackToken,
            long opGeneration) {
        if (!isCurrent(playbackToken)) {
            return;
        }
        if (!admitOperation(opGeneration)) {
            // The engine was reloaded or shut down between speak() and this
            // worker task, or a native release is unconfirmed. No native call
            // may run for this generation.
            failUnadmittedPlayback(playbackToken);
            return;
        }
        try {
            final long synthesisNumber = ++synthesisCount;
            boolean useSegments = segments != null && segments.size() > 1
                    && segmentsMatch(text, segments);
            if (segments != null && !useSegments) {
                log.w("synthesis #" + synthesisNumber
                        + ": segment plan mismatch; using whole-text synthesis", null);
            }
            StreamHandle stream;
            try {
                stream = useSegments
                        ? startStream(opGeneration, null, segments, lang, voice)
                        : startStream(opGeneration, text, null, lang, voice);
            } catch (Throwable failure) {
                stream = StreamHandle.failed(failure.getMessage());
            }
            if (stream.superseded) {
                // A newer generation owns the engine; never fall back or touch
                // the native surface from this stale operation.
                return;
            }
            if (stream.error == null) {
                streamAndPlay(synthesisNumber, callTimeMs, playbackToken,
                        opGeneration, stream.token);
                return;
            }
            if (!isPlaybackCurrent(playbackToken, opGeneration) || !mayUseNative(opGeneration)) {
                return;
            }
            log.w("stream: unavailable (" + stream.error
                    + "); falling back to monolithic synth", null);
            if (!mayUseNative(opGeneration)) {
                return;
            }
            float[] samples = nativeApi.synth(text, lang, voice);
            if (!isPlaybackCurrent(playbackToken, opGeneration) || !mayUseNative(opGeneration)) {
                return;
            }
            if (samples == null || samples.length == 0) {
                if (isPlaybackCurrent(playbackToken, opGeneration)) {
                    notifyError("Synthesis returned no audio");
                    setState(State.READY);
                }
                return;
            }
            long audioDurationMs = Math.round(samples.length * 1000.0 / SAMPLE_RATE);

            final Listener current = listener;
            if (current != null) {
                final long duration = audioDurationMs;
                scheduler.postMain(new Runnable() {
                    @Override
                    public void run() {
                        current.onAudioMeasured(0, duration);
                    }
                });
            }

            playSamples(samples, callTimeMs, playbackToken, opGeneration);
        } catch (Throwable failure) {
            log.e("synthesis/playback failed: " + failure.getMessage(), failure);
            if (isPlaybackCurrent(playbackToken, opGeneration)) {
                notifyError("Synthesis failed: " + failure.getMessage());
                setState(State.READY);
            }
        } finally {
            finishOperation();
        }
    }

    private static boolean segmentsMatch(String text, List<String> segments) {
        StringBuilder joined = new StringBuilder(text.length());
        for (String segment : segments) {
            joined.append(segment);
        }
        return text.equals(joined.toString());
    }

    /** One native stream attempt; {@code token} is 0 unless a stream is live. */
    private static final class StreamHandle {
        final String error;
        final long token;
        final boolean superseded;

        private StreamHandle(String error, long token, boolean superseded) {
            this.error = error;
            this.token = token;
            this.superseded = superseded;
        }

        static StreamHandle ok(long token) {
            return new StreamHandle(null, token, false);
        }

        static StreamHandle failed(String error) {
            return new StreamHandle(
                    error == null ? "stream start failed" : error, 0, false);
        }

        static StreamHandle superseded() {
            return new StreamHandle(null, 0, true);
        }
    }

    /**
     * Opens the global native stream for this operation and drives the
     * start/push/finish handshake.
     *
     * <p>Every call is preceded by a re-check under
     * {@link EngineOwnership#NATIVE_LOCK}: the generation must still be
     * authoritative and the stream token must still be the current one. A
     * reload revokes both, so a stale operation stops at the next call instead
     * of pushing into a replacement's stream.
     */
    private StreamHandle startStream(
            long opGeneration,
            String wholeText,
            List<String> segments,
            String lang,
            String voice) {
        final long streamToken;
        synchronized (EngineOwnership.NATIVE_LOCK) {
            if (!mayUseNativeLocked(opGeneration)) {
                return StreamHandle.superseded();
            }
            streamToken = EngineOwnership.openStream(opGeneration);
        }
        if (streamToken == 0) {
            return StreamHandle.superseded();
        }
        try {
            if (segments == null) {
                if (!streamCallAllowed(opGeneration, streamToken)) {
                    return StreamHandle.superseded();
                }
                String error = nativeApi.streamStart(wholeText, lang, voice);
                if (error != null) {
                    closeStream(opGeneration, streamToken);
                    return StreamHandle.failed(error);
                }
                if (!streamCallAllowed(opGeneration, streamToken)) {
                    return StreamHandle.superseded();
                }
                // A stream is not a native engine instance: it must never
                // create release ownership.
                nativeApi.streamFinish();
            } else {
                if (!streamCallAllowed(opGeneration, streamToken)) {
                    return StreamHandle.superseded();
                }
                String error = nativeApi.streamStart(segments.get(0), lang, voice);
                if (error != null) {
                    closeStream(opGeneration, streamToken);
                    return StreamHandle.failed(error);
                }
                for (int i = 1; i < segments.size(); i++) {
                    if (!streamCallAllowed(opGeneration, streamToken)) {
                        return StreamHandle.superseded();
                    }
                    nativeApi.streamPush(segments.get(i));
                }
                if (!streamCallAllowed(opGeneration, streamToken)) {
                    return StreamHandle.superseded();
                }
                nativeApi.streamFinish();
            }
            return StreamHandle.ok(streamToken);
        } catch (Throwable failure) {
            // A partially started stream is ours until a newer token exists.
            closeStream(opGeneration, streamToken);
            return StreamHandle.failed(failure.getMessage());
        }
    }

    private void streamAndPlay(
            long synthesisNumber,
            long callTimeMs,
            int playbackToken,
            long opGeneration,
            long streamToken) {
        if (!isPlaybackCurrent(playbackToken, opGeneration)) {
            closeStream(opGeneration, streamToken);
            return;
        }
        AudioHandle track = null;
        short[] chunk = new short[2048];
        long totalSamples = 0;
        int chunks = 0;
        boolean stopped = false;
        try {
            track = audioFactory.open();
            audioHandle = track;
            track.play();

            boolean firstWrite = true;
            while (isPlaybackCurrent(playbackToken, opGeneration)
                    && streamCallAllowed(opGeneration, streamToken)) {
                float[] samples = nativeApi.streamNext();
                if (samples == null) {
                    break;
                }
                if (samples.length == 0) {
                    continue;
                }
                chunks++;
                int leadSilence = leadingSilenceSamples(samples);
                int skipSamples = trimLeadingSilence(leadSilence, chunks == 1);
                totalSamples += samples.length - skipSamples;
                for (int offset = skipSamples; offset < samples.length
                        && isPlaybackCurrent(playbackToken, opGeneration); offset += chunk.length) {
                    int count = Math.min(chunk.length, samples.length - offset);
                    for (int i = 0; i < count; i++) {
                        float value = Math.max(-1f, Math.min(1f, samples[offset + i]));
                        chunk[i] = (short) (value * 32767f);
                    }
                    int written = track.write(chunk, 0, count);
                    if (written < 0) {
                        throw new IllegalStateException("AudioTrack.write failed: " + written);
                    }
                    if (firstWrite) {
                        firstWrite = false;
                        log.i("playback: first audio buffer written "
                                + (clock.elapsedRealtime() - callTimeMs) + "ms after speak()");
                    }
                }
            }

            // Losing the stream token is a cancellation (reload/shutdown), not
            // a natural end: never wait for the retired track's tail.
            boolean revoked = !streamCallAllowed(opGeneration, streamToken);
            stopped = !isPlaybackCurrent(playbackToken, opGeneration) || revoked;
            if (chunks == 0) {
                if (isPlaybackCurrent(playbackToken, opGeneration) && !revoked) {
                    notifyError("Synthesis returned no audio");
                    setState(State.READY);
                }
                return;
            }
            long audioDurationMs = Math.round(totalSamples * 1000.0 / SAMPLE_RATE);

            final Listener current = listener;
            if (current != null) {
                final long duration = audioDurationMs;
                scheduler.postMain(new Runnable() {
                    @Override
                    public void run() {
                        current.onAudioMeasured(0, duration);
                    }
                });
            }

            if (!stopped) {
                waitForPlaybackEnd(track, totalSamples, playbackToken, opGeneration);
                stopped = !isPlaybackCurrent(playbackToken, opGeneration);
            }
        } catch (Throwable failure) {
            log.e("stream playback failed: " + failure.getMessage(), failure);
            if (isPlaybackCurrent(playbackToken, opGeneration)) {
                notifyError("Synthesis failed: " + failure.getMessage());
                setState(State.READY);
            }
            return;
        } finally {
            // Token-checked: a stale operation can never clear a newer stream.
            closeStream(opGeneration, streamToken);
            if (audioHandle == track) {
                audioHandle = null;
            }
            if (track != null) {
                try {
                    track.stop();
                } catch (RuntimeException ignored) {
                    // Already stopped.
                }
                track.release();
            }
            if (isPlaybackCurrent(playbackToken, opGeneration)) {
                setState(State.READY);
            }
            log.i("playback: finished stopped=" + stopped + " streamChunks=" + chunks);
        }
    }

    /* ------------------------------------------------------------------ *
     * Native operation lease                                              *
     * ------------------------------------------------------------------ */

    /**
     * Takes the process-wide operation lease for one playback operation. Call
     * under {@link EngineOwnership#NATIVE_LOCK}; the admission predicate is the
     * instance generation, the committed native engine and the unconfirmed
     * release flag.
     */
    private boolean admitOperation(long opGeneration) {
        synchronized (EngineOwnership.NATIVE_LOCK) {
            if (operationActive || shuttingDown.get() || !nativeInitialised) {
                return false;
            }
            if (!EngineOwnership.beginOperation(opGeneration)) {
                return false;
            }
            operationActive = true;
            return true;
        }
    }

    /** Releases the operation lease; runs a deferred reload/shutdown if any. */
    private void finishOperation() {
        Runnable deferred;
        synchronized (EngineOwnership.NATIVE_LOCK) {
            if (!operationActive) {
                return;
            }
            operationActive = false;
            deferred = EngineOwnership.endOperation();
        }
        // Run the drained transition without holding NATIVE_LOCK: it performs
        // its own native init/release under that lock.
        if (deferred != null) {
            deferred.run();
        }
    }

    private boolean mayUseNative(long opGeneration) {
        synchronized (EngineOwnership.NATIVE_LOCK) {
            return mayUseNativeLocked(opGeneration);
        }
    }

    private boolean mayUseNativeLocked(long opGeneration) {
        return operationActive
                && !shuttingDown.get()
                && nativeInitialised
                && !EngineOwnership.isReleaseUnconfirmed()
                && EngineOwnership.owns(opGeneration);
    }

    private boolean streamCallAllowed(long opGeneration, long streamToken) {
        synchronized (EngineOwnership.NATIVE_LOCK) {
            return mayUseNativeLocked(opGeneration)
                    && EngineOwnership.isStreamCurrent(opGeneration, streamToken);
        }
    }

    /**
     * Retires the stream token and clears the native slot only while this
     * operation still owns the current token. Holding {@link
     * EngineOwnership#NATIVE_LOCK} across the (short) clear prevents a racing
     * new stream from being wiped by a stale clear.
     */
    private void closeStream(long opGeneration, long streamToken) {
        synchronized (EngineOwnership.NATIVE_LOCK) {
            if (!EngineOwnership.closeStream(opGeneration, streamToken)) {
                return;
            }
            try {
                nativeApi.streamClear();
            } catch (Throwable ignored) {
                // Instrumentation only.
            }
        }
    }

    /**
     * A playback that could not take the lease was overtaken by a reload or
     * shutdown. Publish the honest terminal state without touching native.
     */
    private void failUnadmittedPlayback(int playbackToken) {
        if (!isCurrent(playbackToken) || shuttingDown.get()) {
            return;
        }
        synchronized (lifecycleLock) {
            if (state == State.SPEAKING) {
                if (EngineOwnership.isReleaseUnconfirmed()) {
                    notifyError(EngineOwnership.REASON_RELEASE_UNCONFIRMED);
                }
                setState(EngineOwnership.isReleaseUnconfirmed()
                        ? State.ERROR : State.READY);
            }
        }
    }

    private static int msToSamples(int milliseconds) {
        return milliseconds * SAMPLE_RATE / 1000;
    }

    private static int leadingSilenceSamples(float[] samples) {
        int count = 0;
        while (count < samples.length && Math.abs(samples[count]) < SILENCE_THRESHOLD) {
            count++;
        }
        return count;
    }

    /**
     * Removes only excessive leading silence: the first chunk is trimmed up to
     * a short cap so playback starts promptly, later chunks keep a natural lead
     * so clause boundaries do not sound clipped.
     */
    private static int trimLeadingSilence(int leadSilence, boolean firstChunk) {
        if (firstChunk) {
            return Math.min(leadSilence, msToSamples(FIRST_CHUNK_TRIM_CAP_MS));
        }
        int excess = Math.max(0, leadSilence - msToSamples(SEGMENT_LEAD_KEEP_MS));
        return Math.min(excess, msToSamples(SEGMENT_TRIM_CAP_MS));
    }

    private void waitForPlaybackEnd(AudioHandle track, long totalFrames,
            int playbackToken, long opGeneration) {
        long deadlineMs = clock.elapsedRealtime() + 5000;
        while (isPlaybackCurrent(playbackToken, opGeneration)
                && track.playbackHeadPosition() < totalFrames
                && clock.elapsedRealtime() < deadlineMs) {
            clock.sleep(20);
        }
    }

    private void playSamples(float[] samples, long callTimeMs, int playbackToken,
            long opGeneration) {
        if (!isPlaybackCurrent(playbackToken, opGeneration)) {
            return;
        }
        AudioHandle track = null;
        boolean stopped = false;
        try {
            track = audioFactory.open();
            audioHandle = track;
            track.play();

            short[] chunk = new short[2048];
            boolean firstWrite = true;
            for (int offset = 0; offset < samples.length
                    && isPlaybackCurrent(playbackToken, opGeneration); offset += chunk.length) {
                int count = Math.min(chunk.length, samples.length - offset);
                for (int i = 0; i < count; i++) {
                    float value = Math.max(-1f, Math.min(1f, samples[offset + i]));
                    chunk[i] = (short) (value * 32767f);
                }
                int written = track.write(chunk, 0, count);
                if (written < 0) {
                    throw new IllegalStateException("AudioTrack.write failed: " + written);
                }
                if (firstWrite) {
                    firstWrite = false;
                    log.i("playback: first audio buffer written "
                            + (clock.elapsedRealtime() - callTimeMs) + "ms after speak()");
                }
            }
            stopped = !isPlaybackCurrent(playbackToken, opGeneration);
            if (!stopped) {
                waitForPlaybackEnd(track, samples.length, playbackToken, opGeneration);
                stopped = !isPlaybackCurrent(playbackToken, opGeneration);
            }
        } catch (Throwable failure) {
            log.e("playback failed: " + failure.getMessage(), failure);
            if (isPlaybackCurrent(playbackToken, opGeneration)) {
                notifyError("Playback failed: " + failure.getMessage());
                setState(State.READY);
            }
            return;
        } finally {
            if (audioHandle == track) {
                audioHandle = null;
            }
            if (track != null) {
                try {
                    track.stop();
                } catch (RuntimeException ignored) {
                    // Already stopped.
                }
                track.release();
            }
            if (isPlaybackCurrent(playbackToken, opGeneration)) {
                setState(State.READY);
            }
            log.i("playback: finished stopped=" + stopped);
        }
    }

    private boolean isCurrent(int playbackToken) {
        return playbackGeneration.isCurrent(playbackToken);
    }

    /**
     * True when this playback token is current <em>and</em> the generation
     * still owns the engine. State publication uses this predicate: a reload
     * that revoked the generation must not let the old worker overwrite
     * LOADING with READY.
     */
    private boolean isPlaybackCurrent(int playbackToken, long opGeneration) {
        return playbackGeneration.isCurrent(playbackToken)
                && !shuttingDown.get()
                && EngineOwnership.owns(opGeneration);
    }

    /**
     * Publishes a state transition. Shutdown is terminal: once the shutdown
     * flag is set, only UNINITIALIZED may still be published, so a stale worker
     * can never post READY/ERROR/SPEAKING after the engine was torn down.
     */
    private void setState(final State next) {
        synchronized (lifecycleLock) {
            if (shuttingDown.get() && next != State.UNINITIALIZED) {
                return;
            }
            state = next;
            final Listener current = listener;
            if (current != null) {
                scheduler.postMain(new Runnable() {
                    @Override
                    public void run() {
                        current.onStateChanged(next);
                    }
                });
            }
        }
    }

    private void notifyError(final String message) {
        final Listener current = listener;
        if (current != null) {
            scheduler.postMain(new Runnable() {
                @Override
                public void run() {
                    current.onError(message);
                }
            });
        }
    }

    /* ------------------------------------------------------------------ *
     * Production platform implementations                                 *
     * ------------------------------------------------------------------ */

    private static final class HandlerScheduler implements Scheduler {
        private final HandlerThread workerThread;
        private final Handler worker;
        private final Handler main;

        HandlerScheduler() {
            this.workerThread = new HandlerThread("daymark-kokoro-tts");
            this.workerThread.start();
            this.worker = new Handler(workerThread.getLooper());
            this.main = new Handler(Looper.getMainLooper());
        }

        @Override
        public boolean postWorker(Runnable task) {
            return worker.post(task);
        }

        @Override
        public void postMain(Runnable task) {
            main.post(task);
        }

        @Override
        public void quitWorker() {
            workerThread.quitSafely();
        }
    }

    private static final class AndroidNativeApi implements NativeApi {
        private final KokoroLocalTtsEngine engine;

        AndroidNativeApi(KokoroLocalTtsEngine engine) {
            this.engine = engine;
        }

        @Override
        public boolean ensureLoaded() {
            return NativeLibraryState.ensureLoaded();
        }

        @Override
        public String failureReason() {
            return NativeLibraryState.failureReason();
        }

        @Override
        public String init(String modelPath, String voicesPath, String voiceName) {
            return engine.nativeInit(modelPath, voicesPath, voiceName);
        }

        @Override
        public float[] synth(String text, String lang, String voiceName) {
            return engine.nativeSynth(text, lang, voiceName);
        }

        @Override
        public String streamStart(String text, String lang, String voiceName) {
            return engine.nativeStreamStart(text, lang, voiceName);
        }

        @Override
        public void streamPush(String text) {
            engine.nativeStreamPush(text);
        }

        @Override
        public void streamFinish() {
            engine.nativeStreamFinish();
        }

        @Override
        public float[] streamNext() {
            return engine.nativeStreamNext();
        }

        @Override
        public void streamClear() {
            engine.nativeStreamClear();
        }

        @Override
        public void release() {
            engine.nativeRelease();
        }
    }

    private static final class AndroidLogSink implements LogSink {
        @Override
        public void i(String message) {
            Log.i(TAG, message);
        }

        @Override
        public void w(String message, Throwable error) {
            Log.w(TAG, message, error);
        }

        @Override
        public void e(String message, Throwable error) {
            Log.e(TAG, message, error);
        }
    }

    private static final class AndroidClock implements Clock {
        @Override
        public long elapsedRealtime() {
            return SystemClock.elapsedRealtime();
        }

        @Override
        public void sleep(long millis) {
            SystemClock.sleep(millis);
        }
    }

    /** AudioTrack-backed playback sink. */
    private static final class AndroidAudioFactory implements AudioFactory {
        @Override
        public AudioHandle open() {
            int minBufferBytes = AudioTrack.getMinBufferSize(
                    SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
            int bufferBytes = Math.max(minBufferBytes, 8192);
            final AudioTrack track = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(SAMPLE_RATE)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setBufferSizeInBytes(bufferBytes)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build();
            return new AudioHandle() {
                @Override
                public void play() {
                    track.play();
                }

                @Override
                public int write(short[] buffer, int offset, int size) {
                    return track.write(buffer, offset, size);
                }

                @Override
                public boolean isPlaying() {
                    return track.getPlayState() == AudioTrack.PLAYSTATE_PLAYING;
                }

                @Override
                public void pause() {
                    track.pause();
                }

                @Override
                public void flush() {
                    track.flush();
                }

                @Override
                public long playbackHeadPosition() {
                    return track.getPlaybackHeadPosition();
                }

                @Override
                public void stop() {
                    track.stop();
                }

                @Override
                public void release() {
                    track.release();
                }
            };
        }
    }

    /** Materialises the packaged model/voices into app-private storage. */
    private static final class AndroidPackagedAssets implements PackagedAssets {
        private final Context context;

        AndroidPackagedAssets(Context context) {
            this.context = context;
        }

        @Override
        public File filesDir() {
            return context.getFilesDir();
        }

        @Override
        public File voicesDir() {
            File directory = new File(filesDir(), "kokoro");
            if (!directory.exists() && !directory.mkdirs()) {
                throw new IllegalStateException("Cannot create " + directory);
            }
            return directory;
        }

        @Override
        public File modelFile() throws Exception {
            File legacyVoice = new File(voicesDir(), LEGACY_VOICE_FILE);
            if (legacyVoice.exists() && legacyVoice.delete()) {
                Log.i(TAG, "initialize: removed legacy " + LEGACY_VOICE_FILE);
            }
            return copyAssetIfNeeded(
                    MODEL_ASSET, "model_quantized.onnx", MODEL_BYTES, MODEL_SHA256);
        }

        @Override
        public void ensureVoice(String voiceName) throws Exception {
            copyAssetIfNeeded(
                    VOICE_ASSET_PREFIX + voiceName + ".bin",
                    voiceName + ".bin",
                    VOICE_BYTES,
                    voiceSha256(voiceName));
        }

        /**
         * Materialises one packaged Kokoro asset and verifies its pinned digest.
         *
         * <p>An existing file is reused only after its bytes match the pinned
         * SHA-256. Otherwise the asset is copied to a temporary file, synced,
         * verified and renamed into place, so a crash never leaves a partial
         * file at the final path and a same-size tampered file is rejected.
         */
        private File copyAssetIfNeeded(
                String assetPath,
                String fileName,
                long expectedBytes,
                String expectedSha256) throws Exception {
            File directory = voicesDir();
            File target = new File(directory, fileName);
            if (KokoroAssetIntegrity.matches(target, expectedBytes, expectedSha256)) {
                return target;
            }

            File temp = new File(directory, fileName + ".part");
            if (temp.exists() && !temp.delete()) {
                throw new IllegalStateException("Cannot remove stale " + temp);
            }
            java.security.MessageDigest digest = KokoroAssetIntegrity.newSha256();
            long copied = 0L;
            try (InputStream input = context.getAssets().open(assetPath);
                 FileOutputStream output = new FileOutputStream(temp)) {
                byte[] buffer = new byte[1 << 16];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (read == 0) {
                        continue;
                    }
                    output.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    copied += read;
                }
                output.flush();
                output.getFD().sync();
            } catch (Exception copyFailed) {
                temp.delete();
                throw copyFailed;
            }

            String actual = KokoroAssetIntegrity.hex(digest.digest());
            if (copied != expectedBytes || !actual.equals(expectedSha256)) {
                temp.delete();
                throw new IllegalStateException(
                        "Kokoro asset integrity mismatch for " + fileName
                                + ": expected " + expectedBytes + " bytes/" + expectedSha256
                                + ", copied " + copied + " bytes/" + actual);
            }
            if (target.exists() && !target.delete()) {
                temp.delete();
                throw new IllegalStateException("Cannot replace " + target);
            }
            if (!temp.renameTo(target)) {
                temp.delete();
                throw new IllegalStateException("Cannot atomically install " + target);
            }
            return target;
        }
    }
}
