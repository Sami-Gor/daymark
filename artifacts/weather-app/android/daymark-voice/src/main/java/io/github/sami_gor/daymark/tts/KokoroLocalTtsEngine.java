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
import java.io.OutputStream;
import java.util.List;

import io.github.sami_gor.daymark.voice.BuildConfig;

/**
 * Kokoro (pguso/kokoro) implementation of {@link LocalTtsEngine}.
 *
 * The 92 MB quantized model and the English, French and Latin American
 * Spanish voice packs ship as APK assets; on first initialization they are
 * copied into the app's files directory because Kokoro loads them from paths.
 * Synthesis runs through a minimal Rust JNI bridge (libkokoro_jni.so) with
 * ONNX Runtime statically linked; nothing is downloaded at runtime.
 *
 * English keeps the existing bm_fable/Misaki path. French and Spanish use
 * piper-plus-g2p 0.5.3 and the ff_siwis/em_alex voice packs. That is a debug
 * POC only: release builds compile {@code MULTILINGUAL_NARRATION = false},
 * materialise only bm_fable and reject French/Spanish before synthesis.
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

    private final Context appContext;
    private final HandlerThread workerThread;
    private final Handler worker;
    private final Handler main;

    private volatile Listener listener;
    private volatile State state = State.UNINITIALIZED;
    private final PlaybackGeneration playbackGeneration = new PlaybackGeneration();
    /** Ownership token for this instance; stale generations must not release. */
    private volatile long generation;
    /** True only after nativeInit succeeded, so release never calls into an unloaded library. */
    private volatile boolean nativeInitialised;
    private volatile AudioTrack audioTrack;
    private int synthesisCount;
    /** Path of the materialised model, retained so the engine can be reloaded. */
    private volatile String modelPath;
    private final ReloadGuard reloadGuard = new ReloadGuard();

    private native String nativeInit(String modelPath, String voicesPath, String voiceName);
    private native float[] nativeSynth(String text, String lang, String voiceName);
    private native String nativeStreamStart(String text, String lang, String voiceName);
    private native void nativeStreamPush(String text);
    private native void nativeStreamFinish();
    private native float[] nativeStreamNext();
    private native void nativeStreamClear();
    private native void nativeRelease();

    /** Optional voices currently installed in app-private storage. */
    private java.util.Set<String> installedVoiceNames() {
        java.util.Set<String> installed = new java.util.HashSet<>();
        File dir = new File(appContext.getFilesDir(), "kokoro");
        String[] names = dir.list();
        if (names == null) {
            return installed;
        }
        for (String name : names) {
            if (!name.endsWith(".bin")) {
                continue;
            }
            String voice = name.substring(0, name.length() - 4);
            if (NarrationVoicePolicy.isMultilingualVoice(voice)) {
                installed.add(voice);
            }
        }
        return installed;
    }

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

    public KokoroLocalTtsEngine(Context context) {
        this.appContext = context.getApplicationContext();
        this.workerThread = new HandlerThread("daymark-kokoro-tts");
        this.workerThread.start();
        this.worker = new Handler(workerThread.getLooper());
        this.main = new Handler(Looper.getMainLooper());
    }

    @Override
    public void initialize(final Listener newListener) {
        this.listener = newListener;
        setState(State.LOADING);
        generation = EngineOwnership.beginInit();
        worker.post(new Runnable() {
            @Override
            public void run() {
                if (!NativeLibraryState.ensureLoaded()) {
                    String reason = NativeLibraryState.failureReason();
                    Log.e(TAG, "initialize: native library unavailable: " + reason);
                    // Voice is optional: report a classified failure and leave
                    // the rest of the app fully usable.
                    notifyError("Initialization failed: "
                            + (reason == null ? NativeLibraryState.REASON_NATIVE_UNAVAILABLE : reason));
                    setState(State.ERROR);
                    return;
                }
                try {
                    File legacyVoice = new File(new File(appContext.getFilesDir(), "kokoro"), LEGACY_VOICE_FILE);
                    if (legacyVoice.exists() && legacyVoice.delete()) {
                        Log.i(TAG, "initialize: removed legacy " + LEGACY_VOICE_FILE);
                    }
                    long copyStart = SystemClock.elapsedRealtime();
                    File modelFile = copyAssetIfNeeded(MODEL_ASSET, "model_quantized.onnx", MODEL_BYTES, MODEL_SHA256);
                    File voicesDir = new File(appContext.getFilesDir(), "kokoro");
                    List<String> voices = NarrationVoicePolicy.packagedVoices(
                            BuildConfig.PACKAGED_MULTILINGUAL_VOICES);
                    for (String voice : voices) {
                        copyAssetIfNeeded(
                                VOICE_ASSET_PREFIX + voice + ".bin",
                                voice + ".bin",
                                VOICE_BYTES,
                                voiceSha256(voice));
                    }
                    modelPath = modelFile.getAbsolutePath();
                    Log.i(TAG, "initialize: assets ready in " + (SystemClock.elapsedRealtime() - copyStart)
                            + "ms modelBytes=" + modelFile.length()
                            + " voices=" + String.join(",", voices));

                    long start = SystemClock.elapsedRealtime();
                    // Serialise with release: a stale instance must not clear the
                    // engine a successful init has just installed.
                    String error;
                    synchronized (EngineOwnership.NATIVE_LOCK) {
                        error = nativeInit(
                                modelFile.getAbsolutePath(),
                                voicesDir.getAbsolutePath(),
                                DEFAULT_VOICE_NAME);
                        if (error == null) {
                            EngineOwnership.commitInit(generation);
                            nativeInitialised = true;
                        }
                    }
                    long elapsedMs = SystemClock.elapsedRealtime() - start;
                    if (error != null) {
                        Log.e(TAG, "initialize: failed: " + error);
                        // Notify before the terminal state so the bridge can
                        // preserve the specific asset/model reason for the UI.
                        notifyError("Initialization failed: " + error);
                        setState(State.ERROR);
                        return;
                    }
                    Log.i(TAG, "initialize: model loaded in " + elapsedMs + "ms defaultVoice=" + DEFAULT_VOICE_NAME);
                    setState(State.READY);
                } catch (Throwable failure) {
                    Log.e(TAG, "initialize: failed: " + failure.getMessage(), failure);
                    notifyError("Initialization failed: " + failure.getMessage());
                    setState(State.ERROR);
                }
            }
        });
    }

    /** Callback for asynchronous voice registration/reload. */
    public interface VoiceOperationResult {
        void onSuccess(java.util.Set<String> installed);

        void onError(String code);
    }

    /** Supported optional voices currently present in app-private storage. */
    public java.util.Set<String> installedOptionalVoices() {
        return VoiceRegistry.installed(new File(appContext.getFilesDir(), "kokoro"));
    }

    /** True when the voice file is present and readable; does not imply loaded. */
    public boolean isVoiceInstalled(String voiceId) {
        return VoiceRegistry.isInstalled(new File(appContext.getFilesDir(), "kokoro"), voiceId);
    }

    /**
     * Registers a voice that the pack manager has already verified and installed.
     *
     * <p>The native engine snapshots its voice directory at initialisation, so a
     * newly installed file only becomes usable after a guarded reload. The
     * previous generation is released only after the replacement initialises;
     * a failed reload attempts to restore the previous voice, and the caller
     * always receives an explicit error instead of a silent English fallback.
     */
    public void registerVoice(final String voiceId, final VoiceOperationResult callback) {
        final File voicesDir = new File(appContext.getFilesDir(), "kokoro");
        final String reason = VoiceRegistry.unavailableReason(voicesDir, voiceId);
        if (reason != null) {
            callback.onError(reason);
            return;
        }
        if (state == State.SPEAKING || state == State.LOADING) {
            callback.onError("operation-conflict");
            return;
        }
        final String model = modelPath;
        if (model == null) {
            callback.onError("engine-not-ready");
            return;
        }
        final long token = reloadGuard.tryBegin();
        if (token < 0) {
            callback.onError("operation-conflict");
            return;
        }
        worker.post(new Runnable() {
            @Override
            public void run() {
                String failure = null;
                java.util.Set<String> installed = VoiceRegistry.installed(voicesDir);
                synchronized (EngineOwnership.NATIVE_LOCK) {
                    try {
                        if (nativeInitialised) {
                            nativeRelease();
                            nativeInitialised = false;
                        }
                        String error = nativeInit(model, voicesDir.getAbsolutePath(), voiceId);
                        if (error == null) {
                            nativeInitialised = true;
                        } else {
                            // Attempt to restore the previous working voice.
                            String restore = nativeInit(model, voicesDir.getAbsolutePath(),
                                    DEFAULT_VOICE_NAME);
                            nativeInitialised = restore == null;
                            failure = "reload-failed";
                            if (restore != null) {
                                failure = "reload-failed-unrecovered";
                                setState(State.ERROR);
                            }
                        }
                    } catch (Throwable error) {
                        Log.e(TAG, "registerVoice: failed", error);
                        failure = "reload-failed";
                    }
                }
                reloadGuard.finish(token);
                if (!reloadGuard.isCurrent(token)) {
                    callback.onError("operation-conflict");
                    return;
                }
                if (failure != null) {
                    callback.onError(failure);
                    return;
                }
                setState(State.READY);
                callback.onSuccess(installed);
            }
        });
    }

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
        if (state != State.READY && state != State.STOPPED) {
            notifyError("engine not ready");
            return;
        }
        final String voice = NarrationVoicePolicy.voiceForLanguage(
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
        if (isSpeaking()) {
            stop();
        }
        final int generation = playbackGeneration.begin();
        final long callTimeMs = SystemClock.elapsedRealtime();
        setState(State.SPEAKING);
        worker.post(new Runnable() {
            @Override
            public void run() {
                synthesizeAndPlay(text, lang, voice, segments, callTimeMs, generation);
            }
        });
    }

    @Override
    public void stop() {
        playbackGeneration.invalidate();
        AudioTrack track = audioTrack;
        if (track != null) {
            try {
                if (track.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) {
                    track.pause();
                }
                track.flush();
            } catch (IllegalStateException ignored) {
                // Track already released by the playback loop.
            }
        }
        if (state == State.SPEAKING) {
            setState(State.STOPPED);
        }
    }

    @Override
    public boolean isSpeaking() {
        return state == State.SPEAKING;
    }

    @Override
    public void shutdown() {
        stop();
        worker.post(new Runnable() {
            @Override
            public void run() {
                try {
                    synchronized (EngineOwnership.NATIVE_LOCK) {
                        if (nativeInitialised && EngineOwnership.claimRelease(generation)) {
                            nativeRelease();
                        } else {
                            Log.i(TAG, "shutdown: skipped release for superseded generation "
                                    + generation);
                        }
                    }
                } catch (Throwable failure) {
                    Log.w(TAG, "shutdown: release failed: " + failure.getMessage());
                }
            }
        });
        workerThread.quitSafely();
        state = State.UNINITIALIZED;
    }

    /**
     * Materialises one packaged Kokoro asset and verifies its pinned digest.
     *
     * <p>An existing file is reused only after its bytes match the pinned
     * SHA-256. Otherwise the asset is copied to a temporary file, synced,
     * verified and renamed into place, so a crash never leaves a partial file at
     * the final path and a same-size tampered file is rejected.
     */
    private File copyAssetIfNeeded(
            String assetPath,
            String fileName,
            long expectedBytes,
            String expectedSha256) throws Exception {
        File directory = new File(appContext.getFilesDir(), "kokoro");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Cannot create " + directory);
        }
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
        try (InputStream input = appContext.getAssets().open(assetPath);
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

    private void synthesizeAndPlay(
            String text,
            String lang,
            String voice,
            List<String> segments,
            long callTimeMs,
            int generation) {
        if (!isCurrent(generation)) {
            return;
        }
        final long synthesisNumber = ++synthesisCount;
        boolean useSegments = segments != null && segments.size() > 1 && segmentsMatch(text, segments);
        if (segments != null && !useSegments) {
            Log.w(TAG, "synthesis #" + synthesisNumber + ": segment plan mismatch; using whole-text synthesis");
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
            streamAndPlay(synthesisNumber, callTimeMs, generation);
            return;
        }
        if (!isCurrent(generation)) {
            return;
        }
        Log.w(TAG, "stream: unavailable (" + streamError + "); falling back to monolithic synth");
        try {
            float[] samples = nativeSynth(text, lang, voice);
            if (!isCurrent(generation)) {
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
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        current.onAudioMeasured(0, duration);
                    }
                });
            }

            playSamples(samples, callTimeMs, generation);
        } catch (Throwable failure) {
            Log.e(TAG, "synthesis/playback failed: " + failure.getMessage(), failure);
            if (isCurrent(generation)) {
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
        String error = nativeStreamStart(text, lang, voice);
        if (error == null) {
            nativeStreamFinish();
        }
        return error;
    }

    private String startSegmentedStream(List<String> segments, String lang, String voice) {
        String error = nativeStreamStart(segments.get(0), lang, voice);
        if (error != null) {
            return error;
        }
        for (int i = 1; i < segments.size(); i++) {
            nativeStreamPush(segments.get(i));
        }
        nativeStreamFinish();
        return null;
    }

    private void streamAndPlay(long synthesisNumber, long callTimeMs, int generation) {
        if (!isCurrent(generation)) {
            return;
        }
        AudioTrack track = null;
        short[] chunk = new short[2048];
        long totalSamples = 0;
        int chunks = 0;
        boolean stopped = false;
        try {
            track = createAudioTrack();
            audioTrack = track;
            track.play();

            boolean firstWrite = true;
            while (isCurrent(generation)) {
                float[] samples = nativeStreamNext();
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
                for (int offset = skipSamples; offset < samples.length && isCurrent(generation); offset += chunk.length) {
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
                        Log.i(TAG, "playback: first audio buffer written "
                                + (SystemClock.elapsedRealtime() - callTimeMs) + "ms after speak()");
                    }
                }
            }

            stopped = !isCurrent(generation);
            if (chunks == 0) {
                if (isCurrent(generation)) {
                    notifyError("Synthesis returned no audio");
                    setState(State.READY);
                }
                return;
            }
            long audioDurationMs = Math.round(totalSamples * 1000.0 / SAMPLE_RATE);

            final Listener current = listener;
            if (current != null) {
                final long duration = audioDurationMs;
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        current.onAudioMeasured(0, duration);
                    }
                });
            }

            if (!stopped) {
                waitForPlaybackEnd(track, totalSamples, generation);
                stopped = !isCurrent(generation);
            }
        } catch (Throwable failure) {
            Log.e(TAG, "stream playback failed: " + failure.getMessage(), failure);
            if (isCurrent(generation)) {
                notifyError("Synthesis failed: " + failure.getMessage());
                setState(State.READY);
            }
            return;
        } finally {
            try {
                nativeStreamClear();
            } catch (Throwable ignored) {
                // Instrumentation only.
            }
            if (audioTrack == track) {
                audioTrack = null;
            }
            if (track != null) {
                try {
                    track.stop();
                } catch (IllegalStateException ignored) {
                    // Already stopped.
                }
                track.release();
            }
            if (isCurrent(generation)) {
                setState(State.READY);
            }
            Log.i(TAG, "playback: finished stopped=" + stopped + " streamChunks=" + chunks);
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

    private AudioTrack createAudioTrack() {
        int minBufferBytes = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int bufferBytes = Math.max(minBufferBytes, 8192);
        return new AudioTrack.Builder()
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
    }

    private void waitForPlaybackEnd(AudioTrack track, long totalFrames, int generation) {
        long deadlineMs = SystemClock.elapsedRealtime() + 5000;
        while (isCurrent(generation) && track.getPlaybackHeadPosition() < totalFrames && SystemClock.elapsedRealtime() < deadlineMs) {
            SystemClock.sleep(20);
        }
    }

    private void playSamples(float[] samples, long callTimeMs, int generation) {
        if (!isCurrent(generation)) {
            return;
        }
        AudioTrack track = null;
        boolean stopped = false;
        try {
            track = createAudioTrack();
            audioTrack = track;
            track.play();

            short[] chunk = new short[2048];
            boolean firstWrite = true;
            for (int offset = 0; offset < samples.length && isCurrent(generation); offset += chunk.length) {
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
                    Log.i(TAG, "playback: first audio buffer written " + (SystemClock.elapsedRealtime() - callTimeMs) + "ms after speak()");
                }
            }
            stopped = !isCurrent(generation);
            if (!stopped) {
                waitForPlaybackEnd(track, samples.length, generation);
                stopped = !isCurrent(generation);
            }
        } catch (Throwable failure) {
            Log.e(TAG, "playback failed: " + failure.getMessage(), failure);
            if (isCurrent(generation)) {
                notifyError("Playback failed: " + failure.getMessage());
                setState(State.READY);
            }
            return;
        } finally {
            if (audioTrack == track) {
                audioTrack = null;
            }
            if (track != null) {
                try {
                    track.stop();
                } catch (IllegalStateException ignored) {
                    // Already stopped.
                }
                track.release();
            }
            if (isCurrent(generation)) {
                setState(State.READY);
            }
            Log.i(TAG, "playback: finished stopped=" + stopped);
        }
    }

    private boolean isCurrent(int generation) {
        return playbackGeneration.isCurrent(generation);
    }

    private void setState(final State next) {
        state = next;
        final Listener current = listener;
        if (current != null) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    current.onStateChanged(next);
                }
            });
        }
    }

    private void notifyError(final String message) {
        final Listener current = listener;
        if (current != null) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    current.onError(message);
                }
            });
        }
    }
}
