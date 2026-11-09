package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.lang.reflect.Field;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Deterministic JVM harness for {@link KokoroLocalTtsEngine}.
 *
 * <p>Unit tests run on a plain JVM with Android stubs, so the engine takes all
 * platform dependencies through its package-private constructor. Work is
 * queued rather than threaded: tests decide exactly when a worker task or a
 * main-thread listener delivery runs, which makes races repeatable.
 */
final class KokoroEngineTestSupport {

    private KokoroEngineTestSupport() {
    }

    /** Queues worker/main tasks; the test drains them in a fixed order. */
    static final class ManualScheduler implements KokoroLocalTtsEngine.Scheduler {
        private final ArrayDeque<Runnable> worker = new ArrayDeque<>();
        private final ArrayDeque<Runnable> main = new ArrayDeque<>();
        private boolean acceptWorker = true;

        @Override
        public synchronized boolean postWorker(Runnable task) {
            if (!acceptWorker) {
                return false;
            }
            worker.add(task);
            return true;
        }

        @Override
        public synchronized void postMain(Runnable task) {
            main.add(task);
        }

        @Override
        public synchronized void quitWorker() {
            acceptWorker = false;
        }

        synchronized int pendingWorker() {
            return worker.size();
        }

        synchronized int pendingMain() {
            return main.size();
        }

        /** Runs one queued worker task; fails when the queue is empty. */
        void runWorker() {
            Runnable task;
            synchronized (this) {
                task = worker.poll();
            }
            assertNotNull("expected a queued worker task", task);
            task.run();
        }

        /** Runs every worker task, including tasks queued while draining. */
        void runAllWorker() {
            while (true) {
                Runnable task;
                synchronized (this) {
                    task = worker.poll();
                }
                if (task == null) {
                    return;
                }
                task.run();
            }
        }

        void runAllMain() {
            while (true) {
                Runnable task;
                synchronized (this) {
                    task = main.poll();
                }
                if (task == null) {
                    return;
                }
                task.run();
            }
        }

        void drain() {
            runAllWorker();
            runAllMain();
        }
    }

    /** Instrumented native bridge with deterministic failure switches. */
    static final class FakeNative implements KokoroLocalTtsEngine.NativeApi {
        boolean loaded = true;
        String loadFailure;
        boolean failAll;
        final Set<String> failingVoices = new HashSet<>();
        final List<String> initCalls = new ArrayList<>();
        /**
         * Number of init calls that actually created a native instance, i.e.
         * returned {@code null}. The exactly-once invariant is per successful
         * init, so tests compare {@link #releaseCount} against this, not
         * against {@link #initCalls} (which also counts failed attempts).
         */
        int successfulInitCalls;
        int releaseCount;
        boolean releaseThrows;
        String streamStartError;
        private final List<float[]> streamChunks = new ArrayList<>();
        int streamClearCount;
        int synthCalls;
        int streamStartCalls;
        int streamPushCalls;
        int streamFinishCalls;
        int streamNextCalls;
        /** Invoked at the start of every init call, before failing. */
        Runnable onInit;
        /**
         * Invoked at the start of every {@link #streamStart} call (the call is
         * already counted and blocked on the hook). Tests use it to hold the
         * engine inside the native stream handshake while another thread runs
         * shutdown/cleanup, which the fake previously could not express.
         */
        Runnable onStreamStart;
        /** Invoked at the start of every {@link #streamNext} call. */
        Runnable onStreamNext;
        /** Invoked at the start of every {@link #synth} call. */
        Runnable onSynth;

        void failVoice(String voice) {
            failingVoices.add(voice);
        }

        void emitChunk(float... samples) {
            streamChunks.add(samples);
        }

        void clearStream() {
            streamChunks.clear();
        }

        int pendingStreamChunks() {
            return streamChunks.size();
        }

        @Override
        public boolean ensureLoaded() {
            return loaded;
        }

        @Override
        public String failureReason() {
            return loadFailure;
        }

        @Override
        public String init(String modelPath, String voicesPath, String voiceName) {
            initCalls.add(voiceName);
            Runnable callback = onInit;
            if (callback != null) {
                callback.run();
            }
            if (failAll || failingVoices.contains(voiceName)) {
                return "kokoro native init failed for " + voiceName;
            }
            successfulInitCalls += 1;
            return null;
        }

        @Override
        public float[] synth(String text, String lang, String voiceName) {
            synthCalls += 1;
            Runnable callback = onSynth;
            if (callback != null) {
                callback.run();
            }
            return null;
        }

        @Override
        public String streamStart(String text, String lang, String voiceName) {
            streamStartCalls += 1;
            Runnable callback = onStreamStart;
            if (callback != null) {
                callback.run();
            }
            return streamStartError;
        }

        @Override
        public void streamPush(String text) {
            streamPushCalls += 1;
        }

        @Override
        public void streamFinish() {
            streamFinishCalls += 1;
        }

        @Override
        public float[] streamNext() {
            streamNextCalls += 1;
            Runnable callback = onStreamNext;
            if (callback != null) {
                callback.run();
            }
            synchronized (streamChunks) {
                if (streamChunks.isEmpty()) {
                    return null;
                }
                return streamChunks.remove(0);
            }
        }

        @Override
        public void streamClear() {
            streamClearCount += 1;
        }

        @Override
        public void release() {
            releaseCount += 1;
            if (releaseThrows) {
                throw new IllegalStateException("native release failed");
            }
        }
    }

    /** File-backed packaged assets rooted in a test temporary directory. */
    static final class FakeAssets implements KokoroLocalTtsEngine.PackagedAssets {
        private final File root;
        private final File voicesDir;
        private final File model;

        FakeAssets(File root) {
            this.root = root;
            this.voicesDir = new File(root, "kokoro");
            assertTrue(voicesDir.exists() || voicesDir.mkdirs());
            this.model = new File(voicesDir, "model_quantized.onnx");
            write(model, "model");
        }

        @Override
        public File filesDir() {
            return root;
        }

        @Override
        public File voicesDir() {
            return voicesDir;
        }

        @Override
        public File modelFile() {
            return model;
        }

        @Override
        public void ensureVoice(String voiceName) {
            install(voiceName);
        }

        void install(String voiceName) {
            File voice = new File(voicesDir, voiceName + ".bin");
            if (!voice.isFile()) {
                write(voice, "voice:" + voiceName);
            }
        }

        void remove(String voiceName) {
            new File(voicesDir, voiceName + ".bin").delete();
        }

        private static void write(File target, String content) {
            try (FileOutputStream output = new FileOutputStream(target)) {
                output.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            } catch (IOException failure) {
                throw new IllegalStateException(failure);
            }
        }
    }

    /** AudioTrack substitute whose writes can run test callbacks re-entrantly. */
    static final class FakeAudioFactory implements KokoroLocalTtsEngine.AudioFactory {
        final List<FakeHandle> handles = new ArrayList<>();
        Runnable onWrite;
        int openCount;

        @Override
        public FakeHandle open() {
            FakeHandle handle = new FakeHandle(this);
            handles.add(handle);
            openCount += 1;
            return handle;
        }

        FakeHandle lastHandle() {
            return handles.isEmpty() ? null : handles.get(handles.size() - 1);
        }
    }

    static final class FakeHandle implements KokoroLocalTtsEngine.AudioHandle {
        private final FakeAudioFactory factory;
        long writtenSamples;
        boolean playing;
        boolean paused;
        boolean stopped;
        boolean released;
        boolean flushCalled;

        FakeHandle(FakeAudioFactory factory) {
            this.factory = factory;
        }

        @Override
        public void play() {
            playing = true;
        }

        @Override
        public int write(short[] buffer, int offset, int size) {
            writtenSamples += size;
            Runnable callback = factory.onWrite;
            if (callback != null) {
                callback.run();
            }
            return size;
        }

        @Override
        public boolean isPlaying() {
            return playing && !paused && !stopped;
        }

        @Override
        public void pause() {
            paused = true;
        }

        @Override
        public void flush() {
            flushCalled = true;
        }

        @Override
        public long playbackHeadPosition() {
            return writtenSamples;
        }

        @Override
        public void stop() {
            stopped = true;
        }

        @Override
        public void release() {
            released = true;
            playing = false;
        }
    }

    static final class FakeLog implements KokoroLocalTtsEngine.LogSink {
        final List<String> errors = new ArrayList<>();
        final List<String> warnings = new ArrayList<>();

        @Override
        public void i(String message) {
        }

        @Override
        public void w(String message, Throwable error) {
            warnings.add(message);
        }

        @Override
        public void e(String message, Throwable error) {
            errors.add(message);
        }
    }

    /** Monotonic fake clock; also advances on sleep so playback waits terminate. */
    static final class FakeClock implements KokoroLocalTtsEngine.Clock {
        private long now;
        long slept;

        @Override
        public long elapsedRealtime() {
            now += 10;
            return now;
        }

        @Override
        public void sleep(long millis) {
            slept += millis;
            now += millis;
        }
    }

    static final class RecordingListener implements LocalTtsEngine.Listener {
        final List<LocalTtsEngine.State> states = new ArrayList<>();
        final List<String> errors = new ArrayList<>();
        final List<Long> audioDurations = new ArrayList<>();

        @Override
        public void onStateChanged(LocalTtsEngine.State state) {
            states.add(state);
        }

        @Override
        public void onError(String message) {
            errors.add(message);
        }

        @Override
        public void onAudioMeasured(long generationMs, long audioDurationMs) {
            audioDurations.add(audioDurationMs);
        }

        void clear() {
            states.clear();
            errors.clear();
            audioDurations.clear();
        }

        int count(LocalTtsEngine.State state) {
            int count = 0;
            for (LocalTtsEngine.State candidate : states) {
                if (candidate == state) {
                    count += 1;
                }
            }
            return count;
        }

        LocalTtsEngine.State lastState() {
            return states.isEmpty() ? null : states.get(states.size() - 1);
        }
    }

    static final class Capture implements KokoroLocalTtsEngine.VoiceOperationResult {
        final List<String> errors = new ArrayList<>();
        final List<Set<String>> successes = new ArrayList<>();

        @Override
        public void onSuccess(Set<String> loadedVoices) {
            successes.add(new HashSet<>(loadedVoices));
        }

        @Override
        public void onError(String code) {
            errors.add(code);
        }

        boolean succeeded() {
            return !successes.isEmpty();
        }

        String lastError() {
            return errors.isEmpty() ? null : errors.get(errors.size() - 1);
        }
    }

    /** Bundles one engine with its fakes and test helpers. */
    static final class Harness {
        final ManualScheduler scheduler = new ManualScheduler();
        final FakeAssets assets;
        final FakeNative nativeApi = new FakeNative();
        final FakeAudioFactory audio = new FakeAudioFactory();
        final FakeLog log = new FakeLog();
        final FakeClock clock = new FakeClock();
        final RecordingListener listener = new RecordingListener();
        final KokoroLocalTtsEngine engine;

        Harness(File root) {
            assets = new FakeAssets(root);
            engine = new KokoroLocalTtsEngine(scheduler, assets, audio, nativeApi, log, clock);
        }

        /** Runs initialize() to READY and drains listener delivery. */
        void initializeReady() {
            engine.initialize(listener);
            scheduler.drain();
        }

        int initializeCalls() {
            return nativeApi.initCalls.size();
        }

        Set<String> loaded() {
            return new HashSet<>(engine.loadedVoices());
        }

        void assertNoPendingWork() {
            assertTrue("unexpected queued worker work", scheduler.pendingWorker() == 0);
        }
    }

    static <T> List<T> copyOf(Collection<T> source) {
        return new ArrayList<>(source);
    }

    /**
     * Reads the engine's exactly-once ownership flag.
     *
     * <p>Test-seam gap: the production engine exposes no way to observe
     * whether {@code nativeInstanceLive} is set, and after {@code shutdown()}
     * no public call reaches the release helper again. N-1 asserts that a
     * stale stream completion must not resurrect ownership, so the guarded
     * field is read directly. If production later exposes the lifecycle
     * snapshot, this helper should switch to it.
     */
    static boolean nativeInstanceLive(KokoroLocalTtsEngine engine) {
        try {
            Field field = KokoroLocalTtsEngine.class.getDeclaredField("nativeInstanceLive");
            field.setAccessible(true);
            return field.getBoolean(engine);
        } catch (ReflectiveOperationException failure) {
            throw new AssertionError("cannot read nativeInstanceLive", failure);
        }
    }
}
