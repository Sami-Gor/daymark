package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;
import java.util.function.LongSupplier;

/**
 * Independent JVM race tests for the Parakeet capture lifecycle, written
 * against the shipped package-private seams only: the
 * {@link SpeechCaptureDevice} supplier, the {@link UtteranceDecoder} seam,
 * the {@link ParakeetSpeechRecognitionPlugin#beginSession(int, StartCallback)}
 * and {@link ParakeetSpeechRecognitionPlugin#cancelSession(int)} seams, the
 * injectable clock and the destroy-join bound.
 *
 * <p>These target the windows the plugin's own test file does not park:
 * a cancellation that wins before the worker task runs at all, the pause
 * trigger, a read that throws after the session already has its terminal
 * outcome, a cancellation during an in-flight decode, destroy during a
 * blocked read, the mid-capture permission loss, and the completed happy
 * path (which no other test drives to a {@code result} event).
 *
 * <p>No Robolectric, no Mockito, no bridge: events are captured by
 * subclassing the plugin and overriding its package-private emitters, and
 * time is a {@link LongSupplier} the tests control.
 */
public class ParakeetLifecycleRaceTest {

    private RacingPlugin plugin;
    private final List<CountDownLatch> gates = new ArrayList<>();

    @Before
    public void setUp() {
        plugin = new RacingPlugin();
        // Time never advances unless a test says so: capture deadlines stay
        // out of the way and capturedMs pins to a deterministic value.
        plugin.clock = new TickingClock(0L);
        // Keep the destroy-time join short so a parked worker only holds the
        // destroy call for the documented bound, not the production 2 s.
        plugin.destroyJoinTimeoutMs = 150;
        plugin.installRecognizer(new RecordingDecoder());
    }

    @After
    public void tearDown() {
        // Every gate opens first so a worker parked on an assertion failure
        // can drain; destroy then joins it and never hangs the daemon.
        for (CountDownLatch gate : gates) {
            gate.countDown();
        }
        plugin.handleOnDestroy();
    }

    // ------------------------------------------------------------------
    // F1 window A: the cancellation wins before the worker task runs.
    // ------------------------------------------------------------------

    /**
     * The worker executor is a single thread, so a first capture task parked
     * inside {@code device.start()} holds the queue. A second session begun
     * while that task is parked is accepted but cannot have started; cancelling
     * it then must mean the worker's second task runs only to see the session
     * is gone: no second microphone is ever created for it. A third session
     * that completes normally afterwards proves the queue drained past the
     * cancelled task (otherwise the proof would only show the task had not
     * run <em>yet</em>).
     */
    @Test
    public void cancelBeforeTheWorkerTaskRunsNeverOpensTheMicrophone() throws Exception {
        final CountDownLatch firstStartEntered = gate();
        final CountDownLatch firstStartParked = gate();
        final AtomicInteger devicesBuilt = new AtomicInteger();
        final List<ScriptedDevice> built = new CopyOnWriteArrayList<>();
        plugin.captureDeviceSupplier = () -> {
            final ScriptedDevice device = new ScriptedDevice();
            if (devicesBuilt.incrementAndGet() == 1) {
                device.duringStart = () -> {
                    firstStartEntered.countDown();
                    hold(gates, firstStartParked);
                };
            } else {
                // Every later device produces a short complete utterance.
                device.script = new int[] { 4000, 4000, 4000 };
            }
            built.add(device);
            return device;
        };

        final RecordingStart first = new RecordingStart();
        assertNotNull("the first session must be accepted", plugin.beginSession(1, first));
        assertTrue("the worker must reach the first device.start()",
                firstStartEntered.await(5, TimeUnit.SECONDS));

        // Cancel session 1 while its task still holds the worker parked
        // inside device.start(): the session dies before the mic is live.
        assertTrue(plugin.cancelSession(1));

        // Session 2 is accepted (the slot is free again) and its capture task
        // queues behind the parked task; cancelling it here means the task
        // has not run yet.
        final RecordingStart second = new RecordingStart();
        assertNotNull("session 2 must be accepted", plugin.beginSession(2, second));
        assertTrue(plugin.cancelSession(2));

        // Let the parked first task finish; it must not publish anything.
        firstStartParked.countDown();

        // Session 3 can only complete if the worker drained past session 2's
        // cancelled task, which must have returned without touching the
        // microphone supplier.
        final RecordingStart third = new RecordingStart();
        assertNotNull("session 3 must be accepted", plugin.beginSession(3, third));
        assertTrue("session 3 must complete after the queue drained",
                eventually(5_000, () -> hasEvent(3, "result")));

        assertEquals("only sessions 1 and 3 may build capture devices; session 2's "
                + "task must return before the supplier is called", 2, devicesBuilt.get());
        assertEquals("the cancelled session 2 must see no events but its abort",
                Collections.singletonList("error:aborted"), terminalSummaries(2));
        assertFalse("a session cancelled before its task ran must never emit started",
                hasEvent(2, "started"));
        assertEquals("the cancelled start call must be settled exactly once with the abort",
                Collections.singletonList("failure:aborted"), second.outcomes);
        assertEquals("the first session's start must be settled with its abort",
                Collections.singletonList("failure:aborted"), first.outcomes);
        assertEquals("the parked task's device must be released exactly once",
                1, built.get(0).releases.get());
        assertEquals("session 3 must complete the full phase sequence",
                Arrays.asList("started", "captureEnd", "result"), eventNames(3));
    }

    // ------------------------------------------------------------------
    // F2: the realistic backgrounding trigger, and the read-error and
    // read-throw paths after the session already has its terminal outcome.
    // ------------------------------------------------------------------

    /**
     * Pausing the activity is how these cancellations actually happen. The
     * pause aborts the session while the worker is blocked in a bounded read;
     * the read that then fails on the abandoned device must not become a
     * second terminal outcome, and the worker still owns the release.
     */
    @Test
    public void pauseDuringABlockedReadAbortsTheSessionExactlyOnce() throws Exception {
        final CountDownLatch readEntered = gate();
        final CountDownLatch readParked = gate();
        final ScriptedDevice device = new ScriptedDevice();
        device.duringRead = () -> {
            readEntered.countDown();
            hold(gates, readParked);
        };
        // Whatever a dying recorder reports once the session is gone.
        device.script = new int[] { -3 };
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(1, start));
        assertTrue("started must arrive while the read is still pending",
                eventually(5_000, () -> hasEvent(1, "started")));
        assertEquals("the start call resolved once the microphone was live",
                Collections.singletonList("success"), start.outcomes);
        assertTrue("the worker must be parked inside read()",
                readEntered.await(5, TimeUnit.SECONDS));

        plugin.handleOnPause();

        assertEquals("the pause must abort the session exactly once",
                Collections.singletonList("error:aborted"), terminalSummaries(1));
        readParked.countDown();

        assertTrue("the worker must release the device after the aborted read",
                eventually(5_000, () -> device.releases.get() == 1));
        assertEquals("no phase event may follow the pause's terminal outcome",
                Arrays.asList("started", "error"), eventNames(1));
        assertEquals("every read must stay bounded", 1, device.readCalls.get());
        assertTrue("every read must use the 100 ms bound",
                device.readTimeouts.stream().allMatch(timeout -> timeout == 100));
        assertEquals("the start call must not be settled a second time",
                Collections.singletonList("success"), start.outcomes);
    }

    /**
     * A read that throws after the abort already produced the session's
     * single terminal outcome: the blanket catch must respect the terminal
     * guard instead of reporting the microphone/model family a second time.
     */
    @Test
    public void aReadThatThrowsAfterTheAbortIsNotASecondTerminalOutcome() throws Exception {
        final CountDownLatch readEntered = gate();
        final CountDownLatch readParked = gate();
        final ScriptedDevice device = new ScriptedDevice();
        device.duringRead = () -> {
            readEntered.countDown();
            hold(gates, readParked);
        };
        device.runtimeExceptionOnRead = true;
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(1, start));
        assertTrue(eventually(5_000, () -> hasEvent(1, "started")));
        assertTrue(readEntered.await(5, TimeUnit.SECONDS));

        assertTrue(plugin.cancelSession(1));
        readParked.countDown();

        assertTrue("the worker must release the device after the throwing read",
                eventually(5_000, () -> device.releases.get() == 1));
        assertEquals("the thrown read must not add a second terminal outcome",
                Collections.singletonList("error:aborted"), terminalSummaries(1));
        assertEquals("no offline-unavailable may follow the abort",
                Collections.emptyList(),
                codesFor(1, "error").stream()
                        .filter(code -> !"aborted".equals(code))
                        .collect(java.util.stream.Collectors.toList()));
        assertEquals(Arrays.asList("started", "error"), eventNames(1));
        assertEquals(Collections.singletonList("success"), start.outcomes);
    }

    // ------------------------------------------------------------------
    // F2/N5: a cancellation during an in-flight decode.
    // ------------------------------------------------------------------

    /**
     * While a decode is in flight the session still owns the slot: a second
     * start is rejected as busy instead of queueing behind the decode. A
     * cancel during the decode must discard the stale transcript, keep the
     * recogniser installed (unlike destroy, cancel does not release it), and
     * leave the worker able to serve the very next session.
     */
    @Test
    public void cancelDuringAnInFlightDecodeDiscardsTheTranscriptAndKeepsTheRecognizer()
            throws Exception {
        final RecordingDecoder decoder = new RecordingDecoder();
        final CountDownLatch decodeEntered = gate();
        final CountDownLatch decodeParked = gate();
        decoder.duringDecode = () -> {
            decodeEntered.countDown();
            hold(gates, decodeParked);
        };
        plugin.installRecognizer(decoder);

        final AtomicInteger devicesBuilt = new AtomicInteger();
        plugin.captureDeviceSupplier = () -> {
            final ScriptedDevice device = new ScriptedDevice();
            device.script = new int[] { 4000, 4000, 4000 };
            devicesBuilt.incrementAndGet();
            return device;
        };

        final RecordingStart first = new RecordingStart();
        assertNotNull(plugin.beginSession(1, first));
        assertTrue("the worker must park inside decode()",
                decodeEntered.await(5, TimeUnit.SECONDS));
        assertEquals("the phases before the decode must be complete",
                Arrays.asList("started", "captureEnd"), eventNames(1));

        // A second start while the first session is decoding: rejected, not
        // queued behind the decode.
        final RecordingStart concurrent = new RecordingStart();
        assertNull("a start during an in-flight decode must be rejected as busy",
                plugin.beginSession(2, concurrent));
        assertEquals(Collections.singletonList("failure:session-busy"), concurrent.outcomes);
        assertEquals("the rejected session must emit nothing",
                Collections.emptyList(), plugin.events.stream()
                        .filter(event -> event.sessionId == 2)
                        .collect(java.util.stream.Collectors.toList()));

        // A third session queues behind the parked decode and must still be
        // served once the cancellation lets the worker continue.
        assertTrue(plugin.cancelSession(1));
        final RecordingStart next = new RecordingStart();
        assertNotNull("a session after the cancelled decode must be accepted",
                plugin.beginSession(3, next));

        decoder.duringDecode = null;
        decodeParked.countDown();

        assertTrue("the next session must complete on the retained recogniser",
                eventually(5_000, () -> hasEvent(3, "result")));
        assertEquals("the cancelled decode's transcript must be discarded",
                Collections.singletonList("error:aborted"), terminalSummaries(1));
        assertFalse("the stale transcript must not be delivered",
                hasEvent(1, "result"));
        assertEquals("the recogniser must survive a cancelled decode",
                0, decoder.releases.get());
        assertTrue("the recogniser must still be installed", plugin.hasRecognizer());
        assertEquals("session 3 must run its decode only after session 1's returned",
                Arrays.asList("decode:enter", "decode:return", "decode:enter", "decode:return"),
                decoder.order);
        assertEquals("two devices are built: one per capture", 2, devicesBuilt.get());
        assertEquals("the completed session keeps the single-terminal contract",
                Arrays.asList("started", "captureEnd", "result"), eventNames(3));
    }

    // ------------------------------------------------------------------
    // F4, destroy-window variant: destroy while the worker is blocked in a
    // bounded read (the plugin's own test parks inside decode instead).
    // ------------------------------------------------------------------

    /**
     * Destroy during a blocked read: the bounded join must expire (the parked
     * read cannot be interrupted, like a native call), destroy must release
     * nothing itself, and the worker must then release both the device and
     * the orphaned recogniser exactly once. A second destroy changes nothing.
     */
    @Test
    public void destroyDuringABlockedReadLeavesTheCleanupToTheWorker() throws Exception {
        final RecordingDecoder decoder = new RecordingDecoder();
        plugin.installRecognizer(decoder);

        final CountDownLatch readEntered = gate();
        final CountDownLatch readParked = gate();
        final ScriptedDevice device = new ScriptedDevice();
        device.duringRead = () -> {
            readEntered.countDown();
            hold(gates, readParked);
        };
        device.script = new int[] { -3 };
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(1, start));
        assertTrue(eventually(5_000, () -> hasEvent(1, "started")));
        assertTrue(readEntered.await(5, TimeUnit.SECONDS));

        plugin.handleOnDestroy();

        assertEquals("destroy must abort the session exactly once",
                Collections.singletonList("error:aborted"), terminalSummaries(1));
        assertEquals("destroy must not release the recogniser under the parked read",
                0, decoder.releases.get());
        assertEquals("destroy must not release the device the worker owns",
                0, device.releases.get());

        readParked.countDown();

        assertTrue("the worker must release the recogniser once the read returns",
                eventually(5_000, () -> decoder.releases.get() == 1));
        assertTrue("the worker must release the device once the read returns",
                eventually(5_000, () -> device.releases.get() == 1));
        assertEquals("the aborted read must not become a second terminal outcome",
                Arrays.asList("started", "error"), eventNames(1));
        assertTrue("every read must use the 100 ms bound",
                device.readTimeouts.stream().allMatch(timeout -> timeout == 100));

        plugin.handleOnDestroy();
        assertEquals("a second destroy must not release anything again",
                1, decoder.releases.get());
        assertEquals(1, device.releases.get());
    }

    // ------------------------------------------------------------------
    // F6: the mic-fault family the plugin's tests do not map.
    // ------------------------------------------------------------------

    /**
     * The permission being revoked while the microphone is already live must
     * surface as a permission failure, not as a capture fault and not as a
     * model failure.
     */
    @Test
    public void aMidCapturePermissionLossIsNotBlamedOnTheModelOrTheMicrophone() {
        final ScriptedDevice device = new ScriptedDevice();
        device.securityExceptionOnRead = true;
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(1, start));

        assertTrue(eventually(5_000, () -> terminalCount(1) == 1));
        assertEquals("a read-time SecurityException keeps its permission meaning",
                "not-allowed", terminalCode(1));
        assertEquals("the microphone was live, so the start call had already resolved",
                Collections.singletonList("success"), start.outcomes);
        assertEquals("the device must be released on the permission path",
                1, device.releases.get());
        assertEquals(Arrays.asList("started", "error"), eventNames(1));
    }

    // ------------------------------------------------------------------
    // F7 payload: the completed utterance, and the capturedMs floor.
    // ------------------------------------------------------------------

    /**
     * The one path no other test drives to the end: a real utterance (onset,
     * hangover, endpoint) must complete with a single {@code result} terminal,
     * the device released exactly once, the recogniser retained for the next
     * session, and {@code captureEnd.capturedMs} reporting the floor (0) when
     * the clock never advances — the value the JS decode watchdog scales from.
     */
    @Test
    public void aCompleteUtteranceReportsTheTranscriptWithTheZeroLengthCapture() {
        final RecordingDecoder decoder = new RecordingDecoder();
        plugin.installRecognizer(decoder);
        final ScriptedDevice device = new ScriptedDevice();
        device.script = new int[] { 4000, 4000, 4000 };
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(1, start));

        assertTrue("the utterance must complete with a result",
                eventually(5_000, () -> hasEvent(1, "result")));
        assertEquals("the full phase sequence must be observed",
                Arrays.asList("started", "captureEnd", "result"), eventNames(1));
        assertEquals("exactly one terminal outcome", 1, terminalCount(1));

        final Observed captureEnd = plugin.events.stream()
                .filter(event -> event.sessionId == 1 && "captureEnd".equals(event.name))
                .findFirst()
                .orElse(null);
        assertNotNull(captureEnd);
        assertNotNull("captureEnd must publish capturedMs", captureEnd.capturedMs);
        assertEquals("a capture with no elapsed clock time reports the zero floor",
                0L, captureEnd.capturedMs.longValue());

        final Observed result = plugin.events.stream()
                .filter(event -> event.sessionId == 1 && "result".equals(event.name))
                .findFirst()
                .orElse(null);
        assertNotNull(result);
        assertEquals("the recogniser's transcript must be delivered",
                "race transcript", result.transcript);

        assertEquals("the worker releases the device once the utterance is complete",
                1, device.releases.get());
        assertEquals("a normal completion must not release the recogniser",
                0, decoder.releases.get());
        assertTrue("the recogniser must stay installed for the next session",
                plugin.hasRecognizer());
        assertEquals(Collections.singletonList("success"), start.outcomes);
    }

    // ------------------------------------------------------------------
    // Harness.
    // ------------------------------------------------------------------

    /** Records every bridge event the plugin would have sent to the web layer. */
    private static final class RacingPlugin extends ParakeetSpeechRecognitionPlugin {
        final List<Observed> events = new CopyOnWriteArrayList<>();

        @Override
        void notifyStarted(int sessionId) {
            events.add(Observed.phase("started", sessionId));
        }

        @Override
        void notifyCaptureEnd(int sessionId, long capturedMs) {
            events.add(Observed.captureEnd(sessionId, capturedMs));
        }

        @Override
        void notifyResult(int sessionId, String transcript) {
            events.add(Observed.result(sessionId, transcript));
        }

        @Override
        void notifyError(int sessionId, String code) {
            events.add(Observed.error(sessionId, code));
        }
    }

    private static final class Observed {
        final String name;
        final int sessionId;
        final String code;
        final Long capturedMs;
        final String transcript;

        Observed(String name, int sessionId, String code, Long capturedMs, String transcript) {
            this.name = name;
            this.sessionId = sessionId;
            this.code = code;
            this.capturedMs = capturedMs;
            this.transcript = transcript;
        }

        static Observed phase(String name, int sessionId) {
            return new Observed(name, sessionId, null, null, null);
        }

        static Observed captureEnd(int sessionId, long capturedMs) {
            return new Observed("captureEnd", sessionId, null, capturedMs, null);
        }

        static Observed result(int sessionId, String transcript) {
            return new Observed("result", sessionId, null, null, transcript);
        }

        static Observed error(int sessionId, String code) {
            return new Observed("error", sessionId, code, null, null);
        }

        boolean isTerminal() {
            return "result".equals(name) || "error".equals(name);
        }
    }

    /**
     * Scriptable fake device. {@code script} gives the amplitude of each read
     * in turn (a negative entry is returned verbatim as a recorder error,
     * past-the-script reads are quiet); the hooks park inside the calls the
     * way the native recorder and HAL can block.
     */
    private static final class ScriptedDevice implements SpeechCaptureDevice {
        final AtomicInteger startCalls = new AtomicInteger();
        final AtomicInteger readCalls = new AtomicInteger();
        final AtomicInteger releases = new AtomicInteger();
        final List<Integer> readTimeouts = new CopyOnWriteArrayList<>();

        volatile boolean startSucceeds = true;
        volatile boolean runtimeExceptionOnRead;
        volatile boolean securityExceptionOnRead;
        /** Number of frames returned per read; -1 uses the whole buffer. */
        volatile int readSize = -1;
        volatile int[] script = new int[0];
        volatile Runnable duringStart;
        volatile Runnable duringRead;

        private final AtomicBoolean released = new AtomicBoolean(false);
        private final AtomicInteger scriptIndex = new AtomicInteger();

        @Override
        public boolean start() {
            startCalls.incrementAndGet();
            if (duringStart != null) {
                duringStart.run();
            }
            return startSucceeds;
        }

        @Override
        public int read(short[] buffer, int timeoutMs) {
            readCalls.incrementAndGet();
            readTimeouts.add(timeoutMs);
            if (duringRead != null) {
                duringRead.run();
            }
            if (runtimeExceptionOnRead) {
                throw new IllegalStateException("audio HAL died");
            }
            if (securityExceptionOnRead) {
                throw new SecurityException("RECORD_AUDIO revoked mid-capture");
            }
            final int index = scriptIndex.getAndIncrement();
            final int level = index < script.length ? script[index] : 0;
            if (level < 0) {
                return level;
            }
            final int size = readSize > 0
                    ? Math.min(readSize, buffer.length)
                    : buffer.length;
            Arrays.fill(buffer, 0, size, (short) level);
            return size;
        }

        @Override
        public boolean isRecording() {
            return !released.get() && startCalls.get() > 0 && startSucceeds;
        }

        @Override
        public void release() {
            if (released.compareAndSet(false, true)) {
                releases.incrementAndGet();
            }
        }
    }

    /** Fake recogniser that can park inside decode() and records its order. */
    private static final class RecordingDecoder implements UtteranceDecoder {
        final AtomicInteger releases = new AtomicInteger();
        final List<String> order = new CopyOnWriteArrayList<>();
        volatile Runnable duringDecode;

        private final AtomicBoolean released = new AtomicBoolean(false);

        @Override
        public String decode(float[] samples, int sampleRate) {
            order.add("decode:enter");
            if (duringDecode != null) {
                duringDecode.run();
            }
            order.add("decode:return");
            return "race transcript";
        }

        @Override
        public void release() {
            if (released.compareAndSet(false, true)) {
                releases.incrementAndGet();
                order.add("release");
            }
        }
    }

    /** Records how the session's start call was settled. */
    private static final class RecordingStart implements ParakeetSpeechRecognitionPlugin.StartCallback {
        final List<String> outcomes = new CopyOnWriteArrayList<>();

        @Override
        public void onSuccess() {
            outcomes.add("success");
        }

        @Override
        public void onFailure(String code) {
            outcomes.add("failure:" + code);
        }
    }

    /**
     * The clock under the plugin's deadlines: a fixed time that optionally
     * steps on every read, so capture lengths are deterministic.
     */
    private static final class TickingClock implements LongSupplier {
        private final AtomicLong now = new AtomicLong(50_000L);
        private final long stepPerRead;

        TickingClock(long stepPerRead) {
            this.stepPerRead = stepPerRead;
        }

        @Override
        public long getAsLong() {
            return now.getAndAdd(stepPerRead);
        }
    }

    /**
     * Park helper for the fakes: they stand in for non-interruptible native
     * calls, so an interrupt (shutdownNow) is ignored exactly like the
     * recorder and the JNI decode would ignore it.
     */
    private static void hold(List<CountDownLatch> registry, CountDownLatch gate) {
        while (true) {
            try {
                gate.await();
                return;
            } catch (InterruptedException ignored) {
                // Keep waiting: the test decides when this fake returns.
            }
        }
    }

    private static boolean eventually(long timeoutMs, BooleanSupplier condition) {
        final long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) {
                return true;
            }
            try {
                Thread.sleep(2);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        return condition.getAsBoolean();
    }

    private CountDownLatch gate() {
        final CountDownLatch gate = new CountDownLatch(1);
        gates.add(gate);
        return gate;
    }

    private List<Observed> sessionEvents(int sessionId) {
        List<Observed> events = new ArrayList<>();
        for (Observed event : plugin.events) {
            if (event.sessionId == sessionId) {
                events.add(event);
            }
        }
        return events;
    }

    private List<String> eventNames(int sessionId) {
        List<String> names = new ArrayList<>();
        for (Observed event : sessionEvents(sessionId)) {
            names.add(event.name);
        }
        return names;
    }

    private boolean hasEvent(int sessionId, String name) {
        for (Observed event : sessionEvents(sessionId)) {
            if (event.name.equals(name)) {
                return true;
            }
        }
        return false;
    }

    private long terminalCount(int sessionId) {
        long count = 0;
        for (Observed event : sessionEvents(sessionId)) {
            if (event.isTerminal()) {
                count++;
            }
        }
        return count;
    }

    private List<String> terminalSummaries(int sessionId) {
        List<String> summaries = new ArrayList<>();
        for (Observed event : sessionEvents(sessionId)) {
            if (event.isTerminal()) {
                summaries.add(event.name + ":" + event.code);
            }
        }
        return summaries;
    }

    private String terminalCode(int sessionId) {
        String code = null;
        long count = 0;
        for (Observed event : sessionEvents(sessionId)) {
            if (event.isTerminal()) {
                code = event.code;
                count++;
            }
        }
        assertEquals("expected exactly one terminal outcome for session " + sessionId, 1L, count);
        return code;
    }

    private List<String> codesFor(int sessionId, String name) {
        List<String> codes = new ArrayList<>();
        for (Observed event : sessionEvents(sessionId)) {
            if (event.name.equals(name)) {
                codes.add(event.code);
            }
        }
        return codes;
    }
}
