package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;
import java.util.function.LongSupplier;
import java.util.stream.Collectors;

/**
 * JVM lifecycle tests for the Parakeet capture pipeline.
 *
 * <p>The plugin is driven through its package-private seams (the
 * {@link SpeechCaptureDevice} supplier, the {@link ParakeetSpeechRecognitionPlugin.StartCallback}
 * begin/cancel seams, the {@link UtteranceDecoder} recogniser seam and the
 * injectable clock) with fakes, so the capture lifecycle races — cancellation
 * during recorder creation, cancellation during a blocked read, destroy during
 * an in-flight decode, a build completing after release — are deterministic
 * here instead of probabilistic on a device.
 *
 * <p>The invariants under test: the start call resolves only once the
 * microphone is running, every session has exactly one terminal outcome with no
 * phase events after it, the capture device is released exactly once by its
 * single owner, the recogniser is never released while a decode is in flight,
 * and microphone faults are reported as audio-capture errors.
 */
public class ParakeetSpeechRecognitionPluginTest {

    private TestPlugin plugin;

    @Before
    public void setUp() {
        plugin = new TestPlugin();
        plugin.clock = new SteadyClock();
        // Keep the destroy-time join short so the tests stay fast.
        plugin.destroyJoinTimeoutMs = 150;
        // The real start() path requires a recognizer before capture begins;
        // give the plugin a fake one unless a test installs its own.
        plugin.installRecognizer(new FakeDecoder());
    }

    @After
    public void tearDown() {
        // Shuts the executors down; idempotent by design.
        plugin.handleOnDestroy();
    }

    // ------------------------------------------------------------------
    // F1: recorder-creation cancellation race and resolve-after-start.
    // ------------------------------------------------------------------

    @Test
    public void resolvesTheStartCallOnlyOnceTheMicrophoneIsRunning() throws InterruptedException {
        final CountDownLatch startEntered = new CountDownLatch(1);
        final CountDownLatch allowStart = new CountDownLatch(1);
        final FakeCaptureDevice device = new FakeCaptureDevice();
        device.duringStart = () -> {
            startEntered.countDown();
            awaitOpen(allowStart);
        };
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(1, start));

        assertTrue("the worker must reach device.start()", startEntered.await(5, TimeUnit.SECONDS));
        assertTrue("the start call must stay pending while the microphone is not running",
                start.outcomes.isEmpty());
        assertTrue("no event may be emitted before the microphone is running",
                sessionEvents(1).isEmpty());

        allowStart.countDown();
        assertTrue("the start call must resolve once the microphone is running",
                awaitWithin(5_000, () -> !start.outcomes.isEmpty()));
        assertEquals(Collections.singletonList("success"), start.outcomes);
        assertTrue(awaitWithin(5_000, () -> hasStartedEvent(1)));
        try {
            // Give the worker a moment to prove it emits nothing else by itself.
            Thread.sleep(20);
        } finally {
            plugin.cancelSession(1);
        }
        assertEquals(Collections.singletonList("error:aborted"), terminalSummaries(1));
        assertTrue("the device must be released after the cancellation",
                awaitWithin(5_000, () -> device.effectiveReleases.get() == 1));
    }

    @Test
    public void cancelDuringRecorderCreationEmitsNoStartedAndLeaksNoMicrophone()
            throws InterruptedException {
        final CountDownLatch startEntered = new CountDownLatch(1);
        final CountDownLatch allowStart = new CountDownLatch(1);
        final FakeCaptureDevice device = new FakeCaptureDevice();
        device.duringStart = () -> {
            startEntered.countDown();
            awaitOpen(allowStart);
        };
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(7, start));
        assertTrue(startEntered.await(5, TimeUnit.SECONDS));

        // Cancel while the worker is still inside device.start().
        assertTrue(plugin.cancelSession(7));
        allowStart.countDown();

        assertTrue("the cancelled session's device must be released",
                awaitWithin(5_000, () -> device.effectiveReleases.get() == 1));
        assertTrue(awaitWithin(5_000, () -> terminalCount(7) == 1));

        final List<RecordedEvent> events = sessionEvents(7);
        assertTrue("a session cancelled during recorder creation must not emit started",
                events.stream().noneMatch(event -> "started".equals(event.name())));
        assertEquals(Collections.singletonList("error:aborted"), terminalSummaries(7));
        assertEquals("the pending start call must be settled with the abort",
                Collections.singletonList("failure:aborted"), start.outcomes);
        assertEquals("the device must be released exactly once", 1, device.effectiveReleases.get());
    }

    // ------------------------------------------------------------------
    // F2: exactly one terminal outcome, no duplicate errors after cancel.
    // ------------------------------------------------------------------

    @Test
    public void cancelDuringABlockedReadEmitsExactlyOneTerminalOutcome()
            throws InterruptedException {
        final CountDownLatch readEntered = new CountDownLatch(1);
        final CountDownLatch allowRead = new CountDownLatch(1);
        final FakeCaptureDevice device = new FakeCaptureDevice();
        device.duringRead = () -> {
            readEntered.countDown();
            awaitOpen(allowRead);
        };
        // After the block: the negative value a released recorder produces.
        device.script = new int[] { -3 };
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(3, start));
        assertTrue(awaitWithin(5_000, () -> hasStartedEvent(3)));
        assertEquals(Collections.singletonList("success"), start.outcomes);
        assertTrue("the worker must be blocked inside read()", readEntered.await(5, TimeUnit.SECONDS));

        assertTrue(plugin.cancelSession(3));
        allowRead.countDown();

        assertTrue("the device must be released after the cancelled read returns",
                awaitWithin(5_000, () -> device.effectiveReleases.get() == 1));
        assertTrue(awaitWithin(5_000, () -> terminalCount(3) == 1));
        assertEquals("the read failure must not become a second terminal error",
                Collections.singletonList("error:aborted"), terminalSummaries(3));
        assertEquals(1, device.effectiveReleases.get());
        assertEquals(Collections.singletonList("success"), start.outcomes);
    }

    @Test
    public void dropsPhaseEventsForASessionThatWasAlreadyTerminated()
            throws InterruptedException {
        final CountDownLatch readEntered = new CountDownLatch(1);
        final CountDownLatch allowRead = new CountDownLatch(1);
        final FakeCaptureDevice device = new FakeCaptureDevice();
        device.duringRead = () -> {
            readEntered.countDown();
            awaitOpen(allowRead);
        };
        // After the block: quiet data, so the loop would keep going.
        device.script = new int[] { 0 };
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(4, start));
        assertTrue(awaitWithin(5_000, () -> hasStartedEvent(4)));
        assertTrue(readEntered.await(5, TimeUnit.SECONDS));

        assertTrue(plugin.cancelSession(4));
        allowRead.countDown();

        assertTrue(awaitWithin(5_000, () -> device.effectiveReleases.get() == 1));
        assertTrue(awaitWithin(5_000, () -> terminalCount(4) == 1));

        final List<RecordedEvent> events = sessionEvents(4);
        assertTrue("a cancelled session must not see captureEnd after its terminal event",
                events.stream().noneMatch(event -> "captureEnd".equals(event.name())));
        assertEquals("no phase event may follow the terminal outcome",
                Collections.singletonList("error:aborted"), terminalSummaries(4));
        assertEquals("the terminal outcome must be the last event of the session",
                "error", events.get(events.size() - 1).name());
    }

    @Test
    public void repeatedStartStopCyclesTearDownCleanly() {
        for (int cycle = 1; cycle <= 5; cycle++) {
            final int sessionId = cycle;
            final FakeCaptureDevice device = new FakeCaptureDevice();
            plugin.captureDeviceSupplier = () -> device;

            final RecordingStart start = new RecordingStart();
            assertNotNull("cycle " + cycle + ": beginSession must accept the session",
                    plugin.beginSession(sessionId, start));
            assertTrue("cycle " + cycle + ": started must arrive",
                    awaitWithin(5_000, () -> hasStartedEvent(sessionId)));
            assertEquals("cycle " + cycle + ": the start call resolves with the mic running",
                    Collections.singletonList("success"), start.outcomes);

            assertTrue("cycle " + cycle + ": cancelSession must abort the session",
                    plugin.cancelSession(sessionId));
            assertTrue("cycle " + cycle + ": the device must be released",
                    awaitWithin(5_000, () -> device.effectiveReleases.get() == 1));
            assertTrue("cycle " + cycle + ": exactly one terminal outcome",
                    awaitWithin(5_000, () -> terminalCount(sessionId) == 1));
            assertEquals("cycle " + cycle, Collections.singletonList("error:aborted"),
                    terminalSummaries(sessionId));
            final List<RecordedEvent> events = sessionEvents(sessionId);
            assertEquals("cycle " + cycle + ": the terminal outcome must be the last event",
                    "error", events.get(events.size() - 1).name());
        }
    }

    @Test
    public void emitsExactlyOneTerminalOutcomeUnderCancellingRaces() {
        final ExecutorService chaos = Executors.newSingleThreadExecutor();
        try {
            for (int attempt = 0; attempt < 20; attempt++) {
                final int sessionId = 100 + attempt;
                final CountDownLatch allowRead = new CountDownLatch(1);
                final FakeCaptureDevice device = new FakeCaptureDevice();
                device.duringRead = () -> awaitOpen(allowRead);
                device.script = new int[] { -3 };
                plugin.captureDeviceSupplier = () -> device;

                final RecordingStart start = new RecordingStart();
                assertNotNull(plugin.beginSession(sessionId, start));
                // Cancel from another thread, with a per-attempt delay, so the
                // cancellation lands in different windows of the lifecycle.
                final int delayMs = attempt;
                chaos.execute(() -> {
                    try {
                        Thread.sleep(delayMs);
                    } catch (InterruptedException ignored) {
                        // Still cancel below; the invariant must hold anyway.
                    }
                    plugin.cancelSession(sessionId);
                    allowRead.countDown();
                });

                assertTrue("attempt " + attempt + ": the session must settle",
                        awaitWithin(10_000,
                                () -> device.effectiveReleases.get() == 1
                                        && terminalCount(sessionId) == 1
                                        && !start.outcomes.isEmpty()));
                final List<RecordedEvent> events = sessionEvents(sessionId);
                assertEquals("attempt " + attempt + ": exactly one terminal outcome",
                        1,
                        events.stream().filter(RecordedEvent::isTerminal).count());
                assertEquals("attempt " + attempt + ": the device must be released exactly once",
                        1, device.effectiveReleases.get());
                assertEquals("attempt " + attempt + ": the start call must be settled exactly once",
                        1, start.outcomes.size());
                final int lastTerminalIndex = lastTerminalIndex(events);
                assertEquals("attempt " + attempt + ": no event may follow the terminal outcome",
                        events.size() - 1, lastTerminalIndex);
            }
        } finally {
            chaos.shutdownNow();
        }
    }

    // ------------------------------------------------------------------
    // F4: destroy during an in-flight decode.
    // ------------------------------------------------------------------

    @Test
    public void destroyDuringAnInFlightDecodeNeverReleasesTheRecognizerEarly()
            throws InterruptedException {
        final FakeCaptureDevice device = new FakeCaptureDevice();
        // Three loud chunks start the utterance; quiet afterwards ends it.
        device.script = new int[] { 4000, 4000, 4000 };
        plugin.captureDeviceSupplier = () -> device;

        final FakeDecoder decoder = new FakeDecoder();
        final CountDownLatch decodeEntered = new CountDownLatch(1);
        final CountDownLatch allowDecode = new CountDownLatch(1);
        decoder.duringDecode = () -> {
            decodeEntered.countDown();
            awaitOpen(allowDecode);
        };
        plugin.installRecognizer(decoder);
        assertTrue(plugin.hasRecognizer());

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(9, start));
        assertTrue("the worker must reach decode()", decodeEntered.await(5, TimeUnit.SECONDS));
        assertEquals(Collections.singletonList("success"), start.outcomes);

        plugin.handleOnDestroy();

        assertEquals("the recognizer must not be released while decode is in flight",
                0, decoder.effectiveReleases.get());
        assertEquals(Collections.singletonList("error:aborted"), terminalSummaries(9));
        assertEquals("the terminal outcome must be the last event of the session",
                Arrays.asList("started", "captureEnd", "error"),
                sessionEvents(9).stream().map(event -> event.name()).collect(Collectors.toList()));

        allowDecode.countDown();
        assertTrue("the worker must release the recognizer once decode returns",
                awaitWithin(5_000, () -> decoder.effectiveReleases.get() == 1));
        assertTrue("the recognizer must be uninstalled",
                awaitWithin(5_000, () -> !plugin.hasRecognizer()));
        assertTrue("the stale transcript must not become a second terminal outcome",
                awaitWithin(5_000, () -> terminalCount(9) == 1
                        && sessionEvents(9).stream().noneMatch(event -> "result".equals(event.name()))));
        assertTrue("decode must return before the recognizer is released",
                decoder.order.indexOf("decode:return") < decoder.order.indexOf("release"));

        // A repeated destroy is a no-op.
        plugin.handleOnDestroy();
        assertEquals("a second destroy must not release anything again",
                1, decoder.effectiveReleases.get());
    }

    // ------------------------------------------------------------------
    // F5: a build completing after release must not be installed.
    // ------------------------------------------------------------------

    @Test
    public void recognizerCompletingAfterReleaseIsDiscardedNotInstalled() {
        plugin.handleOnDestroy();

        final FakeDecoder late = new FakeDecoder();
        plugin.installRecognizer(late);

        assertEquals("a recognizer built after release must be freed", 1, late.effectiveReleases.get());
        assertFalse("a recognizer built after release must not be installed", plugin.hasRecognizer());

        // Positive control: the same call installs before release, and destroy
        // then frees the installed recogniser exactly once.
        final TestPlugin fresh = new TestPlugin();
        fresh.clock = new SteadyClock();
        fresh.destroyJoinTimeoutMs = 150;
        try {
            final FakeDecoder built = new FakeDecoder();
            fresh.installRecognizer(built);
            assertTrue(fresh.hasRecognizer());
            assertEquals(0, built.effectiveReleases.get());
            fresh.handleOnDestroy();
            assertEquals(1, built.effectiveReleases.get());
            assertFalse(fresh.hasRecognizer());
        } finally {
            fresh.handleOnDestroy();
        }
    }

    // ------------------------------------------------------------------
    // F6: microphone faults map to audio-capture, not offline-unavailable.
    // ------------------------------------------------------------------

    @Test
    public void mapsAStartFailureToAudioCaptureNotOfflineUnavailable() {
        final FakeCaptureDevice device = new FakeCaptureDevice();
        device.startSucceeds = false;
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(11, start));

        assertTrue(awaitWithin(5_000, () -> terminalCount(11) == 1));
        assertEquals("a microphone start failure is an audio-capture error",
                "audio-capture", terminalCode(11));
        assertEquals("the start call must be rejected with the capture-specific reason",
                Collections.singletonList("failure:audio-capture"), start.outcomes);
        assertEquals(1, device.effectiveReleases.get());
    }

    @Test
    public void mapsALostPermissionOnStartToNotAllowed() {
        final FakeCaptureDevice device = new FakeCaptureDevice();
        device.throwSecurityException = true;
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(12, start));

        assertTrue(awaitWithin(5_000, () -> terminalCount(12) == 1));
        assertEquals("a SecurityException keeps its permission meaning",
                "not-allowed", terminalCode(12));
        assertEquals(Collections.singletonList("failure:not-allowed"), start.outcomes);
        assertEquals(1, device.effectiveReleases.get());
    }

    @Test
    public void mapsADeadObjectReadToAudioCapture() {
        final FakeCaptureDevice device = new FakeCaptureDevice();
        // ERROR_DEAD_OBJECT after a started recorder.
        device.script = new int[] { -6 };
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(13, start));

        assertTrue(awaitWithin(5_000, () -> terminalCount(13) == 1));
        assertEquals("a dead-object read is an audio-capture error",
                "audio-capture", terminalCode(13));
        assertEquals("the start call had already resolved with the microphone running",
                Collections.singletonList("success"), start.outcomes);
        assertEquals(1, device.effectiveReleases.get());
    }

    // ------------------------------------------------------------------
    // F7: bounded reads keep the capture cap enforceable.
    // ------------------------------------------------------------------

    @Test
    public void captureCapFiresEvenWhenReadsReturnNoData() {
        // One second passes per clock read, so the 30 s cap is reached after
        // about 30 loop iterations even though every read times out empty.
        plugin.clock = new SteadyClock(1_000L);
        final FakeCaptureDevice device = new FakeCaptureDevice();
        device.zeroReads = true;
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(14, start));

        assertTrue(awaitWithin(5_000, () -> terminalCount(14) == 1));
        assertEquals("a capture that never produced data ends as no-speech at the cap",
                "no-speech", terminalCode(14));
        assertTrue("the deadline must be reached despite reads returning no data",
                device.readCalls.get() >= 30);
        assertTrue("every read must be bounded by the read timeout",
                device.readTimeouts.stream().allMatch(timeout -> timeout == 100));
        final RecordedEvent captureEnd = sessionEvents(14).stream()
                .filter(event -> "captureEnd".equals(event.name()))
                .findFirst()
                .orElse(null);
        assertNotNull("the capped capture must still emit captureEnd", captureEnd);
        assertTrue("capturedMs must reflect the capped duration",
                captureEnd.capturedMs() >= 30_000L);
    }

    @Test
    public void noSpeechThenRetryStartsAFreshSuccessfulSession() throws InterruptedException {
        // The first capture produces no data and reaches the 30 s cap.
        plugin.clock = new SteadyClock(1_000L);
        final FakeCaptureDevice noSpeech = new FakeCaptureDevice();
        noSpeech.zeroReads = true;
        plugin.captureDeviceSupplier = () -> noSpeech;

        final RecordingStart first = new RecordingStart();
        assertNotNull(plugin.beginSession(16, first));
        assertTrue(awaitWithin(5_000, () -> terminalCount(16) == 1));
        assertEquals("no-speech", terminalCode(16));

        // A fresh session must be accepted after the failed one.
        plugin.clock = new SteadyClock(0);
        final FakeCaptureDevice successful = new FakeCaptureDevice();
        successful.script = new int[] { 4000, 4000, 4000 };
        plugin.captureDeviceSupplier = () -> successful;
        final RecordingStart second = new RecordingStart();
        assertNotNull(plugin.beginSession(17, second));
        assertTrue("the retry must produce a result",
                awaitWithin(5_000, () -> sessionEvents(17).stream()
                        .anyMatch(event -> "result".equals(event.name()))));
        assertEquals(Collections.singletonList("success"), second.outcomes);
        assertEquals(1, successful.effectiveReleases.get());
    }

    @Test
    public void immediateNewCaptureAfterACompletedLongUtterance() throws InterruptedException {
        // 1,500 sequential 20 ms reads reach the 30 s cap with continuous speech.
        plugin.clock = new SteadyClock(20L);
        final FakeCaptureDevice longDevice = new FakeCaptureDevice();
        longDevice.script = new int[1500];
        Arrays.fill(longDevice.script, 4000);
        plugin.captureDeviceSupplier = () -> longDevice;

        final RecordingStart longStart = new RecordingStart();
        assertNotNull(plugin.beginSession(18, longStart));
        assertTrue("the long capture must complete",
                awaitWithin(5_000, () -> sessionEvents(18).stream()
                        .anyMatch(event -> "result".equals(event.name()))));
        final RecordedEvent longEnd = sessionEvents(18).stream()
                .filter(event -> "captureEnd".equals(event.name()))
                .findFirst()
                .orElse(null);
        assertNotNull(longEnd);
        assertTrue("the long capture should use the full cap",
                longEnd.capturedMs() >= 30_000L);

        // Start the next capture immediately after the terminal result.
        plugin.clock = new SteadyClock(0);
        final FakeCaptureDevice next = new FakeCaptureDevice();
        next.script = new int[] { 4000, 4000, 4000 };
        plugin.captureDeviceSupplier = () -> next;
        final RecordingStart nextStart = new RecordingStart();
        assertNotNull("a new session must not be rejected after the long result",
                plugin.beginSession(19, nextStart));
        assertTrue("the immediate next capture must produce a result",
                awaitWithin(5_000, () -> sessionEvents(19).stream()
                        .anyMatch(event -> "result".equals(event.name()))));
        assertEquals(Collections.singletonList("success"), nextStart.outcomes);
        assertEquals(1, next.effectiveReleases.get());
    }

    @Test
    public void shortReadsUseActualFrameDurationForAClausePause() throws InterruptedException {
        // Six 160-frame speech reads = 60 ms onset. The first quiet run is
        // 100 reads = 1000 ms (below the 1500 ms hangover). Six more speech
        // reads reset it; the final quiet run must consume 150 reads before
        // the endpoint. The old chunk-count detector ended at 75 quiet reads,
        // before the second clause could be included.
        plugin.clock = new SteadyClock(0);
        final FakeCaptureDevice device = new FakeCaptureDevice();
        device.readSize = 160;
        final int[] script = new int[6 + 100 + 6];
        for (int index = 0; index < 6; index++) script[index] = 4000;
        for (int index = 6 + 100; index < script.length; index++) script[index] = 4000;
        device.script = script;
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart start = new RecordingStart();
        assertNotNull(plugin.beginSession(15, start));
        assertTrue("the short-read capture must complete with a result",
                awaitWithin(5_000, () -> sessionEvents(15).stream()
                        .anyMatch(event -> "result".equals(event.name()))));
        assertEquals(Collections.singletonList("success"), start.outcomes);
        assertTrue("the detector must process the full one-second pause and 1.5 s hangover, not 75 reads",
                device.readCalls.get() >= 200);
        assertEquals(1, device.effectiveReleases.get());
    }

    // ------------------------------------------------------------------
    // Unchanged busy/released guards.
    // ------------------------------------------------------------------

    @Test
    public void rejectsASecondSessionWhileOneIsLive() throws InterruptedException {
        final CountDownLatch allowRead = new CountDownLatch(1);
        final FakeCaptureDevice device = new FakeCaptureDevice();
        device.duringRead = () -> awaitOpen(allowRead);
        plugin.captureDeviceSupplier = () -> device;

        final RecordingStart first = new RecordingStart();
        assertNotNull(plugin.beginSession(20, first));
        try {
            assertTrue(awaitWithin(5_000, () -> hasStartedEvent(20)));
            final RecordingStart second = new RecordingStart();
            assertNull("a second session must be rejected as busy",
                    plugin.beginSession(21, second));
            assertEquals(Collections.singletonList("failure:session-busy"), second.outcomes);
            assertEquals(Collections.emptyList(), sessionEvents(21));
        } finally {
            plugin.cancelSession(20);
            allowRead.countDown();
        }
        assertTrue(awaitWithin(5_000, () -> device.effectiveReleases.get() == 1));
    }

    @Test
    public void rejectsAStartAfterRelease() {
        plugin.handleOnDestroy();
        final RecordingStart start = new RecordingStart();
        assertNull(plugin.beginSession(22, start));
        assertEquals(Collections.singletonList("failure:offline-unavailable"), start.outcomes);
        assertEquals(Collections.emptyList(), plugin.events);
    }

    // ------------------------------------------------------------------
    // Harness.
    // ------------------------------------------------------------------

    /** Records every bridge event the plugin would have sent to the web layer. */
    private static final class TestPlugin extends ParakeetSpeechRecognitionPlugin {
        final List<RecordedEvent> events = new java.util.concurrent.CopyOnWriteArrayList<>();

        @Override
        void notifyStarted(int sessionId) {
            events.add(RecordedEvent.started(sessionId));
        }

        @Override
        void notifyCaptureEnd(int sessionId, long capturedMs) {
            events.add(RecordedEvent.captureEnd(sessionId, capturedMs));
        }

        @Override
        void notifyResult(int sessionId, String transcript) {
            events.add(RecordedEvent.result(sessionId, transcript));
        }

        @Override
        void notifyError(int sessionId, String code) {
            events.add(RecordedEvent.error(sessionId, code));
        }
    }

    private record RecordedEvent(String name, int sessionId, String code, Long capturedMs, String transcript) {
        static RecordedEvent started(int sessionId) {
            return new RecordedEvent("started", sessionId, null, null, null);
        }

        static RecordedEvent captureEnd(int sessionId, long capturedMs) {
            return new RecordedEvent("captureEnd", sessionId, null, capturedMs, null);
        }

        static RecordedEvent result(int sessionId, String transcript) {
            return new RecordedEvent("result", sessionId, null, null, transcript);
        }

        static RecordedEvent error(int sessionId, String code) {
            return new RecordedEvent("error", sessionId, code, null, null);
        }

        boolean isTerminal() {
            return "result".equals(name) || "error".equals(name);
        }
    }

    /** Scriptable fake capture device. */
    private static final class FakeCaptureDevice implements SpeechCaptureDevice {
        final AtomicInteger startCalls = new AtomicInteger();
        final AtomicInteger readCalls = new AtomicInteger();
        final AtomicInteger effectiveReleases = new AtomicInteger();
        final List<Integer> readTimeouts = new java.util.concurrent.CopyOnWriteArrayList<>();

        volatile boolean startSucceeds = true;
        volatile boolean throwSecurityException;
        volatile boolean zeroReads;
        volatile Runnable duringStart;
        volatile Runnable duringRead;
        /** Number of frames returned per read; -1 uses the whole buffer. */
        volatile int readSize = -1;
        /** Chunk level per read; a negative entry is returned verbatim as an error. */
        volatile int[] script = new int[0];

        private final AtomicBoolean released = new AtomicBoolean(false);
        private final AtomicInteger scriptIndex = new AtomicInteger();

        @Override
        public boolean start() {
            startCalls.incrementAndGet();
            if (duringStart != null) {
                duringStart.run();
            }
            if (throwSecurityException) {
                throw new SecurityException("RECORD_AUDIO lost");
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
            if (zeroReads) {
                return 0;
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
                effectiveReleases.incrementAndGet();
            }
        }
    }

    /** Fake recogniser that can block inside decode(). */
    private static final class FakeDecoder implements UtteranceDecoder {
        final AtomicInteger effectiveReleases = new AtomicInteger();
        final List<String> order = new java.util.concurrent.CopyOnWriteArrayList<>();
        volatile Runnable duringDecode;

        private final AtomicBoolean released = new AtomicBoolean(false);

        @Override
        public String decode(float[] samples, int sampleRate) {
            order.add("decode:enter");
            if (duringDecode != null) {
                duringDecode.run();
            }
            order.add("decode:return");
            return "blocked-out transcript";
        }

        @Override
        public void release() {
            if (released.compareAndSet(false, true)) {
                effectiveReleases.incrementAndGet();
                order.add("release");
            }
        }
    }

    /** Records the outcome of the session's start call. */
    private static final class RecordingStart implements ParakeetSpeechRecognitionPlugin.StartCallback {
        final List<String> outcomes = new java.util.concurrent.CopyOnWriteArrayList<>();

        @Override
        public void onSuccess() {
            outcomes.add("success");
        }

        @Override
        public void onFailure(String code) {
            outcomes.add("failure:" + code);
        }
    }

    /** Deterministic clock: returns a base time, optionally advancing per read. */
    private static final class SteadyClock implements LongSupplier {
        private final AtomicLong now = new AtomicLong(100_000L);
        private final long stepPerRead;

        SteadyClock() {
            this(0L);
        }

        SteadyClock(long stepPerRead) {
            this.stepPerRead = stepPerRead;
        }

        @Override
        public long getAsLong() {
            return now.getAndAdd(stepPerRead);
        }
    }

    /**
     * Waits for a latch, ignoring interrupts: the fakes stand in for
     * non-interruptible native calls (AudioRecord construction, sherpa decode),
     * which shutdownNow cannot stop either.
     */
    private static void awaitOpen(CountDownLatch latch) {
        while (true) {
            try {
                latch.await();
                return;
            } catch (InterruptedException ignored) {
                // Keep waiting: the test decides when this fake returns.
            }
        }
    }

    private static boolean awaitWithin(long timeoutMs, BooleanSupplier condition) {
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

    private List<RecordedEvent> sessionEvents(int sessionId) {
        return plugin.events.stream()
                .filter(event -> event.sessionId() == sessionId)
                .collect(Collectors.toList());
    }

    private boolean hasStartedEvent(int sessionId) {
        return sessionEvents(sessionId).stream().anyMatch(event -> "started".equals(event.name()));
    }

    private long terminalCount(int sessionId) {
        return sessionEvents(sessionId).stream().filter(RecordedEvent::isTerminal).count();
    }

    private List<String> terminalSummaries(int sessionId) {
        return sessionEvents(sessionId).stream()
                .filter(RecordedEvent::isTerminal)
                .map(event -> event.name() + ":" + event.code())
                .collect(Collectors.toList());
    }

    private String terminalCode(int sessionId) {
        final List<RecordedEvent> terminals = sessionEvents(sessionId).stream()
                .filter(RecordedEvent::isTerminal)
                .collect(Collectors.toList());
        assertEquals("expected exactly one terminal outcome for session " + sessionId,
                1, terminals.size());
        return terminals.get(0).code();
    }

    private static int lastTerminalIndex(List<RecordedEvent> events) {
        for (int index = events.size() - 1; index >= 0; index--) {
            if (events.get(index).isTerminal()) {
                return index;
            }
        }
        return -1;
    }
}
