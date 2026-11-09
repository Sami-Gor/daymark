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
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

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

    /**
     * One native bridge call with the process-wide resource identity it
     * touched. The ordered log is the oracle for cross-generation tests: a
     * stale operation is detected when its call lands before/after the call it
     * must not overlap, not by inspecting a single counter.
     */
    static final class NativeCall {
        final int sequence;
        final String kind;
        final int instanceId;
        final int streamToken;
        final String detail;

        NativeCall(int sequence, String kind, int instanceId, int streamToken, String detail) {
            this.sequence = sequence;
            this.kind = kind;
            this.instanceId = instanceId;
            this.streamToken = streamToken;
            this.detail = detail;
        }

        @Override
        public String toString() {
            StringBuilder text = new StringBuilder("#").append(sequence).append(' ').append(kind);
            if (instanceId != 0) {
                text.append(" instance=").append(instanceId);
            }
            if (streamToken != 0) {
                text.append(" stream=").append(streamToken);
            }
            if (detail != null) {
                text.append(" (").append(detail).append(')');
            }
            return text.toString();
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
         * reported success. The exactly-once invariant is per successful
         * init, so tests compare {@link #releaseCount} against this, not
         * against {@link #initCalls} (which also counts failed attempts).
         */
        int successfulInitCalls;
        /**
         * Simulates a JNI implementation that reports the failed error-string
         * allocation by returning the null success sentinel without an
         * exception: the init failed, no engine was created, yet the native
         * call returned {@code null}. {@link #successfulInitCalls} is not
         * incremented for such a call.
         */
        boolean loseInitErrorString;
        /** Result of the most recent init call; see {@link #initSucceeded()}. */
        private boolean lastInitSucceeded;
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

        /**
         * Ordered record of every native call, shared by every engine instance
         * in a test (the bridge is process-wide).
         */
        final List<NativeCall> calls =
                Collections.synchronizedList(new ArrayList<NativeCall>());
        /** Instance ids actually destroyed by {@link #release}; duplicates are a double free. */
        final List<Integer> releasedInstanceIds =
                Collections.synchronizedList(new ArrayList<Integer>());
        /** Releases attempted while no native instance was live (blind release). */
        int releaseWithoutInstance;
        /** Native instance created by the last successful init; 0 once released. */
        private int activeInstanceId;
        /** Identity of the single process-wide STREAM slot; 0 when no stream is open. */
        private int activeStreamToken;
        private int nextInstanceId = 1;
        private int nextStreamToken = 1;
        private int callSequence;

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
                lastInitSucceeded = false;
                if (loseInitErrorString) {
                    // The bridge failed but lost its error text: the Java side
                    // observes exactly the same null as a successful init.
                    return null;
                }
                return "kokoro native init failed for " + voiceName;
            }
            lastInitSucceeded = true;
            successfulInitCalls += 1;
                record("init-failed", 0, 0, voiceName);
                return "kokoro native init failed for " + voiceName;
            }
            int instanceId;
            synchronized (this) {
                instanceId = nextInstanceId++;
                activeInstanceId = instanceId;
                successfulInitCalls += 1;
            }
            record("init", instanceId, 0, voiceName);
            return null;
        }

        @Override
        public boolean initSucceeded() {
            return lastInitSucceeded;
        }

        @Override
        public float[] synth(String text, String lang, String voiceName) {
            synthCalls += 1;
            Runnable callback = onSynth;
            if (callback != null) {
                callback.run();
            }
            record("synth", activeInstanceId(), 0, voiceName);
            return null;
        }

        @Override
        public String streamStart(String text, String lang, String voiceName) {
            streamStartCalls += 1;
            int token;
            synchronized (this) {
                token = nextStreamToken++;
                activeStreamToken = token;
            }
            record("streamStart", activeInstanceId(), token, voiceName);
            Runnable callback = onStreamStart;
            if (callback != null) {
                callback.run();
            }
            if (streamStartError != null) {
                synchronized (this) {
                    if (activeStreamToken == token) {
                        activeStreamToken = 0;
                    }
                }
                record("streamStart-failed", activeInstanceId(), token, streamStartError);
            }
            record("streamStart-return", activeInstanceId(),
                    streamStartError == null ? token : 0, null);
            return streamStartError;
        }

        @Override
        public void streamPush(String text) {
            streamPushCalls += 1;
            record("streamPush", activeInstanceId(), activeStreamToken(), null);
        }

        @Override
        public void streamFinish() {
            streamFinishCalls += 1;
            record("streamFinish", activeInstanceId(), activeStreamToken(), null);
        }

        @Override
        public float[] streamNext() {
            streamNextCalls += 1;
            Runnable callback = onStreamNext;
            if (callback != null) {
                callback.run();
            }
            record("streamNext", activeInstanceId(), activeStreamToken(), null);
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
            int cleared;
            synchronized (this) {
                cleared = activeStreamToken;
                activeStreamToken = 0;
            }
            // A shared native STREAM slot: clearing whatever is currently open
            // destroys a newer stream unless the caller is prevented from
            // touching a slot it no longer owns.
            record("streamClear", activeInstanceId(), cleared, null);
        }

        @Override
        public void release() {
            releaseCount += 1;
            int released;
            synchronized (this) {
                released = activeInstanceId;
                activeInstanceId = 0;
                if (released == 0) {
                    releaseWithoutInstance += 1;
                } else {
                    releasedInstanceIds.add(released);
                }
            }
            record("release", released, 0, released == 0 ? "no live instance" : null);
            if (releaseThrows) {
                throw new IllegalStateException("native release failed");
            }
        }

        private NativeCall record(String kind, int instanceId, int streamToken, String detail) {
            synchronized (this) {
                NativeCall call =
                        new NativeCall(++callSequence, kind, instanceId, streamToken, detail);
                calls.add(call);
                return call;
            }
        }

        synchronized int activeInstanceId() {
            return activeInstanceId;
        }

        synchronized int activeStreamToken() {
            return activeStreamToken;
        }

        /** Immutable snapshot of the call log, safe to iterate off-thread. */
        List<NativeCall> callsSnapshot() {
            synchronized (calls) {
                return new ArrayList<>(calls);
            }
        }

        List<Integer> releasedSnapshot() {
            synchronized (releasedInstanceIds) {
                return new ArrayList<>(releasedInstanceIds);
            }
        }

        /** Count of calls of one kind, optionally restricted to one stream token. */
        int countCalls(String kind, int streamToken) {
            int count = 0;
            for (NativeCall call : callsSnapshot()) {
                if (call.kind.equals(kind) && (streamToken == -1 || call.streamToken == streamToken)) {
                    count += 1;
                }
            }
            return count;
        }

        int countCalls(String kind) {
            return countCalls(kind, -1);
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
        /** Per-handle write hook, used when a test must hold two sessions at once. */
        interface WriteHook {
            void onWrite(FakeHandle handle);
        }

        final List<FakeHandle> handles = new ArrayList<>();
        Runnable onWrite;
        WriteHook writeHook;
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
            FakeAudioFactory.WriteHook hook = factory.writeHook;
            if (hook != null) {
                hook.onWrite(this);
                return size;
            }
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

        /**
         * Builds a second engine object that shares the process-wide native
         * bridge, assets, audio and log but has its own worker queue and
         * listener: the renderer-recreation replacement in lifecycle tests.
         */
        KokoroLocalTtsEngine newEngine(ManualScheduler secondScheduler,
                RecordingListener secondListener) {
            return new KokoroLocalTtsEngine(
                    secondScheduler, assets, audio, nativeApi, log, clock);
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

    /* ------------------------------------------------------------------ *
     * Deterministic cross-thread helpers (latches, never Thread.sleep)    *
     * ------------------------------------------------------------------ */

    static Thread startDaemon(String name, final Runnable body) {
        Thread thread = new Thread(body, name);
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    static void joinOrFail(Thread thread) {
        try {
            thread.join(5000);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("interrupted while joining " + thread.getName());
        }
        assertTrue("worker thread did not finish: " + thread.getName(), !thread.isAlive());
    }

    /** Bounded wait used only to decide whether a forbidden event happens at all. */
    static boolean awaitQuietly(CountDownLatch latch, long millis) {
        try {
            return latch.await(millis, TimeUnit.MILLISECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("interrupted while awaiting a test latch", interrupted);
        }
    }

    static void await(CountDownLatch latch, String what) {
        try {
            assertTrue("timed out waiting for " + what, latch.await(5, TimeUnit.SECONDS));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("interrupted while waiting for " + what, interrupted);
        }
    }

    /** Used from inside a fake-native or audio hook running on a worker thread. */
    static void awaitUnchecked(CountDownLatch latch, String what) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("timed out waiting inside a native hook for " + what);
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("interrupted inside a native hook", interrupted);
        }
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
