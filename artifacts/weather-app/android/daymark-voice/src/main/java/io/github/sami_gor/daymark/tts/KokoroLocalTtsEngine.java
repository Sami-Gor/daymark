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

/**
 * Kokoro (pguso/kokoro) implementation of {@link LocalTtsEngine}.
 *
 * The 92 MB quantized model and the single British male voice (bm_fable) ship
 * as APK assets; on first initialization they are copied into the app's files
 * directory because Kokoro loads them from paths. Synthesis runs through a
 * minimal Rust JNI bridge (libkokoro_jni.so) with ONNX Runtime statically
 * linked; nothing is downloaded at runtime.
 *
 * This is a separate proof of concept and does not replace the existing
 * Web Speech API narration or the Sherpa POC.
 */
public final class KokoroLocalTtsEngine implements LocalTtsEngine {

    private static final String TAG = "DaymarkKokoroTts";
    private static final String VOICE_NAME = "bm_fable";
    private static final String LEGACY_VOICE_FILE = "bm_george.bin";
    private static final String MODEL_ASSET = "kokoro/model_quantized.onnx";
    private static final String VOICE_ASSET = "kokoro/bm_fable.bin";
    private static final int SAMPLE_RATE = 24000;
    private static final float SILENCE_THRESHOLD = 0.004f;
    private static final int FIRST_CHUNK_TRIM_CAP_MS = 300;
    private static final int SEGMENT_LEAD_KEEP_MS = 100;
    private static final int SEGMENT_TRIM_CAP_MS = 600;

    static {
        System.loadLibrary("kokoro_jni");
    }

    private final Context appContext;
    private final HandlerThread workerThread;
    private final Handler worker;
    private final Handler main;

    private volatile Listener listener;
    private volatile State state = State.UNINITIALIZED;
    private volatile boolean stopRequested;
    private volatile AudioTrack audioTrack;
    private int synthesisCount;

    private native String nativeInit(String modelPath, String voicePath, String voiceName);
    private native float[] nativeSynth(String text);
    private native String nativeStreamStart(String text);
    private native void nativeStreamPush(String text);
    private native void nativeStreamFinish();
    private native float[] nativeStreamNext();
    private native void nativeStreamClear();
    private native void nativeRelease();

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
        worker.post(new Runnable() {
            @Override
            public void run() {
                try {
                    File legacyVoice = new File(new File(appContext.getFilesDir(), "kokoro"), LEGACY_VOICE_FILE);
                    if (legacyVoice.exists() && legacyVoice.delete()) {
                        Log.i(TAG, "initialize: removed legacy " + LEGACY_VOICE_FILE);
                    }
                    long copyStart = SystemClock.elapsedRealtime();
                    File modelFile = copyAssetIfNeeded(MODEL_ASSET, "model_quantized.onnx");
                    File voiceFile = copyAssetIfNeeded(VOICE_ASSET, VOICE_NAME + ".bin");
                    Log.i(TAG, "initialize: assets ready in " + (SystemClock.elapsedRealtime() - copyStart)
                            + "ms modelBytes=" + modelFile.length() + " voiceBytes=" + voiceFile.length());

                    long start = SystemClock.elapsedRealtime();
                    String error = nativeInit(modelFile.getAbsolutePath(), voiceFile.getAbsolutePath(), VOICE_NAME);
                    long elapsedMs = SystemClock.elapsedRealtime() - start;
                    if (error != null) {
                        Log.e(TAG, "initialize: failed: " + error);
                        setState(State.ERROR);
                        notifyError("Initialization failed: " + error);
                        return;
                    }
                    Log.i(TAG, "initialize: model loaded in " + elapsedMs + "ms voice=" + VOICE_NAME);
                    setState(State.READY);
                } catch (Throwable failure) {
                    Log.e(TAG, "initialize: failed: " + failure.getMessage(), failure);
                    setState(State.ERROR);
                    notifyError("Initialization failed: " + failure.getMessage());
                }
            }
        });
    }

    @Override
    public void speak(final String text) {
        speak(text, null);
    }

    /**
     * @param segments optional TTS-only segmentation plan; must concatenate to
     *                 {@code text} exactly, otherwise whole-text synthesis is used.
     */
    public void speak(final String text, final List<String> segments) {
        if (state != State.READY && state != State.STOPPED) {
            setState(State.ERROR);
            notifyError("Engine is not ready");
            return;
        }
        if (isSpeaking()) {
            stop();
        }
        stopRequested = false;
        final long callTimeMs = SystemClock.elapsedRealtime();
        setState(State.SPEAKING);
        worker.post(new Runnable() {
            @Override
            public void run() {
                synthesizeAndPlay(text, segments, callTimeMs);
            }
        });
    }

    @Override
    public void stop() {
        stopRequested = true;
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
        stopRequested = true;
        stop();
        worker.post(new Runnable() {
            @Override
            public void run() {
                try {
                    nativeRelease();
                } catch (Throwable failure) {
                    Log.w(TAG, "shutdown: release failed: " + failure.getMessage());
                }
            }
        });
        workerThread.quitSafely();
        state = State.UNINITIALIZED;
    }

    private File copyAssetIfNeeded(String assetPath, String fileName) throws Exception {
        File directory = new File(appContext.getFilesDir(), "kokoro");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Cannot create " + directory);
        }
        File target = new File(directory, fileName);
        try (InputStream input = appContext.getAssets().open(assetPath)) {
            int expected = input.available();
            if (target.exists() && expected > 0 && target.length() == expected) {
                return target;
            }
            try (OutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[1 << 16];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
            }
        }
        return target;
    }

    private void synthesizeAndPlay(String text, List<String> segments, long callTimeMs) {
        final long synthesisNumber = ++synthesisCount;
        boolean useSegments = segments != null && segments.size() > 1 && segmentsMatch(text, segments);
        if (segments != null && !useSegments) {
            Log.w(TAG, "synthesis #" + synthesisNumber + ": segment plan mismatch; using whole-text synthesis");
        }
        String streamError = null;
        try {
            streamError = useSegments ? startSegmentedStream(segments) : startWholeStream(text);
        } catch (Throwable failure) {
            streamError = failure.getMessage();
        }
        if (streamError == null) {
            streamAndPlay(synthesisNumber, callTimeMs);
            return;
        }
        Log.w(TAG, "stream: unavailable (" + streamError + "); falling back to monolithic synth");
        try {
            float[] samples = nativeSynth(text);
            if (samples == null || samples.length == 0) {
                setState(State.ERROR);
                notifyError("Synthesis returned no audio");
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

            playSamples(samples, callTimeMs);
        } catch (Throwable failure) {
            Log.e(TAG, "synthesis/playback failed: " + failure.getMessage(), failure);
            setState(State.ERROR);
            notifyError("Synthesis failed: " + failure.getMessage());
        }
    }

    private static boolean segmentsMatch(String text, List<String> segments) {
        StringBuilder joined = new StringBuilder(text.length());
        for (String segment : segments) {
            joined.append(segment);
        }
        return text.equals(joined.toString());
    }

    private String startWholeStream(String text) {
        String error = nativeStreamStart(text);
        if (error == null) {
            nativeStreamFinish();
        }
        return error;
    }

    private String startSegmentedStream(List<String> segments) {
        String error = nativeStreamStart(segments.get(0));
        if (error != null) {
            return error;
        }
        for (int i = 1; i < segments.size(); i++) {
            nativeStreamPush(segments.get(i));
        }
        nativeStreamFinish();
        return null;
    }

    private void streamAndPlay(long synthesisNumber, long callTimeMs) {
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
            while (!stopRequested) {
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
                for (int offset = skipSamples; offset < samples.length && !stopRequested; offset += chunk.length) {
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

            stopped = stopRequested;
            if (chunks == 0) {
                setState(State.ERROR);
                notifyError("Synthesis returned no audio");
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
                waitForPlaybackEnd(track, totalSamples);
                stopped = stopRequested;
            }
        } catch (Throwable failure) {
            Log.e(TAG, "stream playback failed: " + failure.getMessage(), failure);
            setState(State.ERROR);
            notifyError("Synthesis failed: " + failure.getMessage());
            return;
        } finally {
            try {
                nativeStreamClear();
            } catch (Throwable ignored) {
                // Instrumentation only.
            }
            audioTrack = null;
            if (track != null) {
                try {
                    track.stop();
                } catch (IllegalStateException ignored) {
                    // Already stopped.
                }
                track.release();
            }
            if (state != State.ERROR) {
                setState(stopped ? State.STOPPED : State.READY);
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

    private void waitForPlaybackEnd(AudioTrack track, long totalFrames) {
        long deadlineMs = SystemClock.elapsedRealtime() + 5000;
        while (!stopRequested && track.getPlaybackHeadPosition() < totalFrames && SystemClock.elapsedRealtime() < deadlineMs) {
            SystemClock.sleep(20);
        }
    }

    private void playSamples(float[] samples, long callTimeMs) {
        AudioTrack track = null;
        boolean stopped = false;
        try {
            track = createAudioTrack();
            audioTrack = track;
            track.play();

            short[] chunk = new short[2048];
            boolean firstWrite = true;
            for (int offset = 0; offset < samples.length && !stopRequested; offset += chunk.length) {
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
            stopped = stopRequested;
            if (!stopped) {
                waitForPlaybackEnd(track, samples.length);
                stopped = stopRequested;
            }
        } catch (Throwable failure) {
            Log.e(TAG, "playback failed: " + failure.getMessage(), failure);
            setState(State.ERROR);
            notifyError("Playback failed: " + failure.getMessage());
            return;
        } finally {
            audioTrack = null;
            if (track != null) {
                try {
                    track.stop();
                } catch (IllegalStateException ignored) {
                    // Already stopped.
                }
                track.release();
            }
            if (state != State.ERROR) {
                setState(stopped ? State.STOPPED : State.READY);
            }
            Log.i(TAG, "playback: finished stopped=" + stopped);
        }
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
