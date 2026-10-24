package io.github.sami_gor.daymark.voice;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.SystemClock;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * {@link SpeechCaptureDevice} backed by a real {@link AudioRecord}.
 *
 * <p>The recorder is constructed, started and verified inside
 * {@link #start()}, so a caller can never observe a half-open microphone, and
 * {@link #read} is bounded so a stalled audio input cannot block the capture
 * loop forever.
 */
final class AudioSpeechCaptureDevice implements SpeechCaptureDevice {

    /** Same buffer floor the capture loop always used. */
    private static final int MIN_BUFFER_BYTES = 64000;
    /** How long a data-less read waits before polling again. Not a busy spin. */
    private static final long POLL_INTERVAL_MS = 5;

    private final int sampleRate;
    private final Object lock = new Object();
    private final AtomicBoolean released = new AtomicBoolean(false);

    /** Guarded by {@link #lock}; null until started or after release. */
    private AudioRecord recorder;

    AudioSpeechCaptureDevice(int sampleRate) {
        this.sampleRate = sampleRate;
    }

    @Override
    public boolean start() {
        final AudioRecord built;
        synchronized (lock) {
            if (released.get()) {
                return false;
            }
        }
        final int minBuffer = AudioRecord.getMinBufferSize(
                sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minBuffer <= 0) {
            return false;
        }
        try {
            built = new AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    sampleRate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    Math.max(minBuffer * 4, MIN_BUFFER_BYTES));
        } catch (SecurityException permissionLost) {
            throw permissionLost;
        } catch (RuntimeException constructionFailed) {
            return false;
        }
        if (built.getState() != AudioRecord.STATE_INITIALIZED) {
            quietRelease(built);
            return false;
        }
        try {
            built.startRecording();
        } catch (SecurityException permissionLost) {
            quietRelease(built);
            throw permissionLost;
        } catch (RuntimeException startFailed) {
            quietRelease(built);
            return false;
        }
        if (built.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
            // A silent start failure (mic held elsewhere, policy refusal, OEM
            // quirk) must not be reported as a started capture.
            quietRelease(built);
            return false;
        }
        synchronized (lock) {
            if (released.get()) {
                // Released while the recorder was being built; the caller no
                // longer owns a session, so this device must not leak.
                quietRelease(built);
                return false;
            }
            recorder = built;
        }
        return true;
    }

    @Override
    public int read(short[] buffer, int timeoutMs) {
        if (buffer == null || buffer.length == 0) {
            return 0;
        }
        final int waitMs = Math.max(0, timeoutMs);
        final long deadline = SystemClock.elapsedRealtime() + waitMs;
        final AudioRecord current;
        synchronized (lock) {
            current = recorder;
        }
        if (current == null || released.get()) {
            return -1;
        }
        int offset = 0;
        while (offset < buffer.length) {
            if (released.get()) {
                return offset > 0 ? offset : -1;
            }
            final int read;
            try {
                read = current.read(buffer, offset, buffer.length - offset, AudioRecord.READ_NON_BLOCKING);
            } catch (RuntimeException error) {
                return -1;
            }
            if (read < 0) {
                // Includes ERROR_DEAD_OBJECT and ERROR_INVALID_OPERATION.
                return read;
            }
            if (read > 0) {
                offset += read;
                continue;
            }
            if (SystemClock.elapsedRealtime() >= deadline) {
                break;
            }
            try {
                Thread.sleep(POLL_INTERVAL_MS);
            } catch (InterruptedException interrupted) {
                // The executor is shutting down; return what we have so the
                // capture loop can re-check the cancellation flag.
                break;
            }
        }
        return offset;
    }

    @Override
    public boolean isRecording() {
        synchronized (lock) {
            final AudioRecord current = recorder;
            return current != null
                    && !released.get()
                    && current.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING;
        }
    }

    @Override
    public void release() {
        if (!released.compareAndSet(false, true)) {
            return;
        }
        final AudioRecord current;
        synchronized (lock) {
            current = recorder;
            recorder = null;
        }
        if (current == null) {
            return;
        }
        try {
            if (current.getState() == AudioRecord.STATE_INITIALIZED) {
                current.stop();
            }
        } catch (Throwable ignored) {
            // The recorder may already be stopped; releasing is what matters.
        }
        try {
            current.release();
        } catch (Throwable ignored) {
            // Nothing useful to do while cleaning up.
        }
    }

    private static void quietRelease(AudioRecord recorder) {
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
}
