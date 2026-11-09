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

                long start = clock.elapsedRealtime();
                String error = null;
                boolean committed = false;
                synchronized (EngineOwnership.NATIVE_LOCK) {
                    // Re-check under the native lock: a newer reservation must
                    // never be overwritten by this slow initialisation.
                    if (!isStillWanted(initGeneration)) {
                        abandonStaleInitialisation(initGeneration);
                        return;
                    }
                    error = nativeApi.init(
                            modelFile.getAbsolutePath(),
                            voicesDir.getAbsolutePath(),
                            DEFAULT_VOICE_NAME);
                    if (error == null) {
                        // The bridge created a native instance: claim it before
                        // any re-check can release it. This is the only kind of
                        // site allowed to set the ownership flag.
                        nativeInstanceLive = true;
                        // Re-check after the (slow) native call: shutdown may
                        // have started, or a newer generation may have been
                        // reserved while we were inside the bridge.
                        if (shuttingDown.get()
                                || !EngineOwnership.isLatestReservation(initGeneration)) {
                            releaseNativeInstanceLocked();
                        } else {
                            // Ownership is committed only after the native engine
                            // accepted the model/voice, and only if no newer
                            // initialisation reserved the engine meanwhile.
                            committed = EngineOwnership.commitInit(initGeneration);
                            if (committed) {
                                nativeInitialised = true;
                                loadedVoices = Collections.singleton(DEFAULT_VOICE_NAME);
                            } else {
                                // Superseded during commit: release the engine
                                // we created; the newer generation will initialise.
                                releaseNativeInstanceLocked();
                            }
                        }
                    }
                }
                long elapsedMs = clock.elapsedRealtime() - start;
                if (error != null) {
                    log.e("initialize: failed: " + error, null);
                    // Notify before the terminal state so the bridge can
                    // preserve the specific asset/model reason for the UI.
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
        String failure = null;
        Set<String> loaded = null;
        boolean stale = false;
        boolean recovered = false;
        synchronized (EngineOwnership.NATIVE_LOCK) {
            if (!mayRunReload(token, reloadGeneration)) {
                // A stale reload must not release, initialise or otherwise
                // touch the native engine a newer generation may own.
                stale = true;
            } else {
                try {
                    if (nativeInitialised) {
                        releaseNativeInstanceLocked();
                    }
                    String error = nativeApi.init(model, voicesDir.getAbsolutePath(), voiceId);
                    if (error == null) {
                        // A native instance exists again: claim it before the
                        // post-init re-check can release it.
                        nativeInstanceLive = true;
                        // Re-check after the native call: shutdown or a newer
                        // reservation may have arrived while we were inside it.
                        if (!mayRunReload(token, reloadGeneration)) {
                            releaseNativeInstanceLocked();
                            stale = true;
                        } else if (EngineOwnership.commitInit(reloadGeneration)) {
                            nativeInitialised = true;
                            generation = reloadGeneration;
                            loaded = Collections.singleton(voiceId);
                            loadedVoices = loaded;
                        } else {
                            releaseNativeInstanceLocked();
                            stale = true;
                        }
                    } else {
                        log.e("registerVoice: failed: " + error, null);
                        if (!mayRunReload(token, reloadGeneration)) {
                            stale = true;
                        } else {
                            // Attempt to restore the previous working voice.
                            String restore = nativeApi.init(
                                    model, voicesDir.getAbsolutePath(), previousVoice);
                            if (restore == null) {
                                // The restore created another instance; claim
                                // it before the re-check can release it.
                                nativeInstanceLive = true;
                                if (!mayRunReload(token, reloadGeneration)) {
                                    releaseNativeInstanceLocked();
                                    stale = true;
                                } else if (EngineOwnership.commitInit(reloadGeneration)) {
                                    nativeInitialised = true;
                                    generation = reloadGeneration;
                                    loaded = Collections.singleton(previousVoice);
                                    loadedVoices = loaded;
                                    recovered = true;
                                    failure = "reload-failed";
                                } else {
                                    releaseNativeInstanceLocked();
                                    stale = true;
                                }
                            } else {
                                failure = "reload-failed-unrecovered";
                            }
                        }
                    }
                } catch (Throwable error) {
                    log.e("registerVoice: failed: " + error.getMessage(), error);
                    // Never leave a released engine without attempting to
                    // restore the previously working voice.
                    if (!mayRunReload(token, reloadGeneration)) {
                        stale = true;
                    } else {
                        try {
                            if (nativeInitialised) {
                                releaseNativeInstanceLocked();
                            }
                            String restore = nativeApi.init(
                                    model, voicesDir.getAbsolutePath(), previousVoice);
                            if (restore != null) {
                                failure = "reload-failed-unrecovered";
                            } else {
                                // The restore created a native instance: claim it
                                // before the re-check can release it.
                                nativeInstanceLive = true;
                                if (!mayRunReload(token, reloadGeneration)
                                        || !EngineOwnership.commitInit(reloadGeneration)) {
                                    releaseNativeInstanceLocked();
                                    stale = true;
                                } else {
                                    nativeInitialised = true;
                                    generation = reloadGeneration;
                                    loaded = Collections.singleton(previousVoice);
                                    loadedVoices = loaded;
                                    recovered = true;
                                    failure = "reload-failed";
                                }
                            }
                        } catch (Throwable restoreFailure) {
                            log.e("registerVoice: restore failed",
                                    restoreFailure);
                            nativeInitialised = false;
                            failure = "reload-failed-unrecovered";
                        }
                    }
                }
                if (failure != null && !recovered) {
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
                    loadedVoices = Collections.emptySet();
                    EngineOwnership.claimRelease(generation);
                }
            }
        }
        boolean current = reloadGuard.isCurrent(token);
        reloadGuard.finish(token);
        if (stale || !current) {
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
        if (failure != null) {
            setState(recovered ? State.READY : State.ERROR);
            callback.onError(failure);
            return;
        }
        if (loaded == null) {
            // Defensive: a current operation with no committed voice.
            setState(State.ERROR);
            callback.onError("reload-failed-unrecovered");
            return;
        }
        setState(State.READY);
        callback.onSuccess(loaded);
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
        synchronized (lifecycleLock) {
            if (shuttingDown.get()) {
                notifyError("engine-shutdown");
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
                synthesizeAndPlay(text, lang, voice, segments, callTimeMs, playbackToken);
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
     * {@link LogSink#e} and the release is deliberately not retried. Logging
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
            log.e("releaseNativeInstanceLocked: native release failed; "
                    + "ownership cleared, no retry", failure);
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
        }
        reloadGuard.invalidate();
        stopPlayback();
        loadedVoices = Collections.emptySet();
        scheduler.postWorker(new Runnable() {
            @Override
            public void run() {
                try {
                    synchronized (EngineOwnership.NATIVE_LOCK) {
                        // Read the generation when the task runs: an in-flight
                        // reload that committed a newer generation just before
                        // shutdown must be the one released.
                        boolean owned = EngineOwnership.claimRelease(generation);
                        if (owned && nativeInitialised) {
                            releaseNativeInstanceLocked();
                        } else if (owned) {
                            // A reload already released the native engine
                            // before it was interrupted: only clear ownership.
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
        });
        scheduler.quitWorker();
        setState(State.UNINITIALIZED);
    }

    private void synthesizeAndPlay(
            String text,
            String lang,
            String voice,
            List<String> segments,
            long callTimeMs,
            int playbackToken) {
        if (!isCurrent(playbackToken)) {
            return;
        }
        final long synthesisNumber = ++synthesisCount;
        boolean useSegments = segments != null && segments.size() > 1 && segmentsMatch(text, segments);
        if (segments != null && !useSegments) {
            log.w("synthesis #" + synthesisNumber + ": segment plan mismatch; using whole-text synthesis", null);
        }
        String streamError = null;
        try {
            streamError = useSegments
                    ? startSegmentedStream(segments, lang, voice)
                    : startWholeStream(text, lang, voice);
        } catch (Throwable failure) {
            streamError = failure.getMessage();
        }
        if (streamError == null) {
            streamAndPlay(synthesisNumber, callTimeMs, playbackToken);
            return;
        }
        if (!isCurrent(playbackToken)) {
            return;
        }
        log.w("stream: unavailable (" + streamError + "); falling back to monolithic synth", null);
        try {
            float[] samples = nativeApi.synth(text, lang, voice);
            if (!isCurrent(playbackToken)) {
                return;
            }
            if (samples == null || samples.length == 0) {
                notifyError("Synthesis returned no audio");
                setState(State.READY);
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

            playSamples(samples, callTimeMs, playbackToken);
        } catch (Throwable failure) {
            log.e("synthesis/playback failed: " + failure.getMessage(), failure);
            if (isCurrent(playbackToken)) {
                notifyError("Synthesis failed: " + failure.getMessage());
                setState(State.READY);
            }
        }
    }

    private static boolean segmentsMatch(String text, List<String> segments) {
        StringBuilder joined = new StringBuilder(text.length());
        for (String segment : segments) {
            joined.append(segment);
        }
        return text.equals(joined.toString());
    }

    private String startWholeStream(String text, String lang, String voice) {
        String error = nativeApi.streamStart(text, lang, voice);
        if (error == null) {
            // A stream is not a native engine instance: it must never create
            // release ownership. Ownership belongs to the last successful init.
            nativeApi.streamFinish();
        }
        return error;
    }

    private String startSegmentedStream(List<String> segments, String lang, String voice) {
        String error = nativeApi.streamStart(segments.get(0), lang, voice);
        if (error != null) {
            return error;
        }
        for (int i = 1; i < segments.size(); i++) {
            nativeApi.streamPush(segments.get(i));
        }
        nativeApi.streamFinish();
        return null;
    }

    private void streamAndPlay(long synthesisNumber, long callTimeMs, int playbackToken) {
        if (!isCurrent(playbackToken)) {
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
            while (isCurrent(playbackToken)) {
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
                for (int offset = skipSamples; offset < samples.length && isCurrent(playbackToken); offset += chunk.length) {
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

            stopped = !isCurrent(playbackToken);
            if (chunks == 0) {
                if (isCurrent(playbackToken)) {
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
                waitForPlaybackEnd(track, totalSamples, playbackToken);
                stopped = !isCurrent(playbackToken);
            }
        } catch (Throwable failure) {
            log.e("stream playback failed: " + failure.getMessage(), failure);
            if (isCurrent(playbackToken)) {
                notifyError("Synthesis failed: " + failure.getMessage());
                setState(State.READY);
            }
            return;
        } finally {
            try {
                nativeApi.streamClear();
            } catch (Throwable ignored) {
                // Instrumentation only.
            }
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
            if (isCurrent(playbackToken)) {
                setState(State.READY);
            }
            log.i("playback: finished stopped=" + stopped + " streamChunks=" + chunks);
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

    private void waitForPlaybackEnd(AudioHandle track, long totalFrames, int playbackToken) {
        long deadlineMs = clock.elapsedRealtime() + 5000;
        while (isCurrent(playbackToken)
                && track.playbackHeadPosition() < totalFrames
                && clock.elapsedRealtime() < deadlineMs) {
            clock.sleep(20);
        }
    }

    private void playSamples(float[] samples, long callTimeMs, int playbackToken) {
        if (!isCurrent(playbackToken)) {
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
            for (int offset = 0; offset < samples.length && isCurrent(playbackToken); offset += chunk.length) {
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
            stopped = !isCurrent(playbackToken);
            if (!stopped) {
                waitForPlaybackEnd(track, samples.length, playbackToken);
                stopped = !isCurrent(playbackToken);
            }
        } catch (Throwable failure) {
            log.e("playback failed: " + failure.getMessage(), failure);
            if (isCurrent(playbackToken)) {
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
            if (isCurrent(playbackToken)) {
                setState(State.READY);
            }
            log.i("playback: finished stopped=" + stopped);
        }
    }

    private boolean isCurrent(int playbackToken) {
        return playbackGeneration.isCurrent(playbackToken);
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
