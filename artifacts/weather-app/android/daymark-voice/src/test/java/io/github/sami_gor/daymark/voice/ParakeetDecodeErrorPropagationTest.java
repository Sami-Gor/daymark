package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.LongSupplier;
import java.util.stream.Collectors;

/**
 * JVM tests for this change: a decoder refusal must reach the app as an
 * explicit failure code, never as silence and never as an empty transcript.
 *
 * <p>The sherpa native runtime cannot run on the host (it ships only for
 * arm64-v8a Android), so the native boundary is represented by the
 * {@link UtteranceDecoder} seam and the deterministic
 * {@link ParakeetSpeechRecognitionPlugin#classifyDecodedText(String, boolean)}
 * mapping. The tests drive the real capture/decode/finish code in
 * {@link ParakeetSpeechRecognitionPlugin} with a fake device and a fake
 * decoder, exactly like the existing lifecycle tests do.
 */
public class ParakeetDecodeErrorPropagationTest {

    private TestPlugin plugin;
    private ScriptedDecoder decoder;

    @Before
    public void setUp() {
        plugin = new TestPlugin();
        plugin.clock = new LongSupplier() {
            @Override
            public long getAsLong() {
                return 42_000L;
            }
        };
        plugin.destroyJoinTimeoutMs = 150;
        decoder = new ScriptedDecoder();
        plugin.installRecognizer(decoder);
    }

    @After
    public void tearDown() {
        plugin.handleOnDestroy();
    }

    // ------------------------------------------------------------------
    // The refusal itself: explicit error, never a transcript, not silence.
    // ------------------------------------------------------------------

    @Test
    public void decoderRefusalIsReportedAsModelRejectedNotNoSpeech() {
        final List<String> terminal = runDecodedSession(
                31, DecodeOutcome.refused(DecodeOutcome.DETAIL_NATIVE_REFUSAL));

        assertEquals("a security refusal has its own terminal code",
                Collections.singletonList("error:model-rejected"), terminal);
        assertTrue("a refused decode must never deliver a result event",
                plugin.results(31).isEmpty());
        assertEquals("the session must still resolve its start call once the microphone ran",
                Collections.singletonList("success"), plugin.lastStart.outcomes);
    }

    @Test
    public void emptyDecodeIsReportedAsEmptyTranscriptNotNoSpeech() {
        final List<String> terminal = runDecodedSession(32, DecodeOutcome.empty());

        assertEquals("an empty decode after speech is a distinct failure, not silence",
                Collections.singletonList("error:empty-transcript"), terminal);
        assertTrue("an empty decode must never deliver a result event",
                plugin.results(32).isEmpty());
        assertTrue("no-speech is reserved for a capture that never contained speech",
                plugin.errors(32).stream().noneMatch("no-speech"::equals));
    }

    @Test
    public void failedDecodeIsReportedAsDecodeFailed() {
        final List<String> terminal = runDecodedSession(33,
                DecodeOutcome.failed(DecodeOutcome.DETAIL_NATIVE_FAILURE));

        assertEquals(Collections.singletonList("error:decode-failed"), terminal);
        assertTrue(plugin.results(33).isEmpty());
    }

    @Test
    public void decoderExceptionBecomesDecodeFailedInsteadOfSilenceOrCrash() {
        decoder.failWith = new IllegalStateException("native decode failed");
        final List<String> terminal = runSession(34);

        assertEquals("a throwing decoder is a terminal decode failure",
                Collections.singletonList("error:decode-failed"), terminal);
        assertTrue(plugin.results(34).isEmpty());
    }

    @Test
    public void nonEmptyDecodeIsStillDeliveredAsAResult() {
        assertEquals(Collections.singletonList("result:transcript"),
                runDecodedSession(35, DecodeOutcome.decoded("  turn on the lights  ")));
        assertEquals("the delivered transcript is trimmed",
                "turn on the lights", plugin.transcripts(35).get(0));
        assertTrue(plugin.errors(35).isEmpty());
    }

    @Test
    public void decodedOutcomeWithBlankTextIsNeverDeliveredAsAnEmptyTranscript() {
        // Defense in depth: even a malformed DECODED outcome cannot become a
        // successful empty transcript.
        final List<String> terminal = runDecodedSession(36, DecodeOutcome.decoded("   "));

        assertEquals(Collections.singletonList("error:empty-transcript"), terminal);
        assertTrue(plugin.results(36).isEmpty());
    }

    @Test
    public void silenceStillReportsNoSpeech() {
        // No speech onset at all: the endpoint detector never fires, the decode
        // is never attempted and the code stays no-speech.
        final AtomicInteger now = new AtomicInteger(1_000);
        plugin.clock = () -> now.addAndGet(1_000);
        final FakeCaptureDevice device = new FakeCaptureDevice();
        device.zeroReads = true;
        plugin.captureDeviceSupplier = () -> device;

        assertNotNull(plugin.beginSession(37, plugin.lastStart));
        assertTrue(awaitWithin(5_000, () -> plugin.terminalCount(37) == 1));
        assertEquals(Collections.singletonList("error:no-speech"), plugin.terminalSummaries(37));
        assertEquals("no decode may run when no speech was detected",
                0, decoder.decodeCalls.get());
    }

    // ------------------------------------------------------------------
    // The pure native-boundary mapping.
    // ------------------------------------------------------------------

    @Test
    public void classifiesNativeTextAndRefusalSignalDeterministically() {
        final DecodeOutcome decoded =
                ParakeetSpeechRecognitionPlugin.classifyDecodedText("  hello  ", false);
        assertEquals(DecodeOutcome.Status.DECODED, decoded.status());
        assertEquals("hello", decoded.text());

        final DecodeOutcome empty =
                ParakeetSpeechRecognitionPlugin.classifyDecodedText("   ", false);
        assertEquals(DecodeOutcome.Status.EMPTY, empty.status());

        final DecodeOutcome nullText =
                ParakeetSpeechRecognitionPlugin.classifyDecodedText(null, false);
        assertEquals(DecodeOutcome.Status.EMPTY, nullText.status());

        final DecodeOutcome refused =
                ParakeetSpeechRecognitionPlugin.classifyDecodedText("", true);
        assertEquals("an observable native refusal is classified as REFUSED",
                DecodeOutcome.Status.REFUSED, refused.status());

        final DecodeOutcome refusedNull =
                ParakeetSpeechRecognitionPlugin.classifyDecodedText(null, true);
        assertEquals(DecodeOutcome.Status.REFUSED, refusedNull.status());
    }

    @Test
    public void refusalSignalPrecedenceIsDocumentedAndStable() {
        // A refusal signal with a non-empty transcript cannot happen, but even
        // then the text wins: the app must never drop a real transcript.
        final DecodeOutcome outcome =
                ParakeetSpeechRecognitionPlugin.classifyDecodedText("real words", true);
        assertEquals(DecodeOutcome.Status.DECODED, outcome.status());
        assertEquals("real words", outcome.text());
    }

    // ------------------------------------------------------------------
    // Bridge payload contract: code + additive stage metadata.
    // ------------------------------------------------------------------

    @Test
    public void errorPayloadCarriesCodeAndStageForEachDecodeFailure() throws Exception {
        assertErrorPayload("model-rejected", "model-rejected", "decode");
        assertErrorPayload("empty-transcript", "empty-transcript", "decode");
        assertErrorPayload("decode-failed", "decode-failed", "decode");
        // Existing codes keep their meaning and gain a stage.
        assertErrorPayload("no-speech", "no-speech", "capture");
        assertErrorPayload("audio-capture", "audio-capture", "capture");
        assertErrorPayload("offline-unavailable", "offline-unavailable", "model");
        assertErrorPayload("session-busy", "session-busy", "session");
        assertErrorPayload("model-corrupt", "model-corrupt", "unknown");
    }

    private static void assertErrorPayload(String code, String expectedCode, String expectedStage)
            throws Exception {
        final com.getcapacitor.JSObject payload =
                ParakeetSpeechRecognitionPlugin.buildErrorEvent(9, code);
        assertEquals(expectedCode, payload.getString("code"));
        assertEquals("stage for " + code, expectedStage, payload.getString("stage"));
        assertEquals(9, payload.getInt("sessionId"));
    }

    // ------------------------------------------------------------------
    // Harness.
    // ------------------------------------------------------------------

    private List<String> runDecodedSession(int sessionId, DecodeOutcome outcome) {
        decoder.outcome = outcome;
        return runSession(sessionId);
    }

    private List<String> runSession(int sessionId) {
        final FakeCaptureDevice device = new FakeCaptureDevice();
        // Three speech chunks start the utterance; the fake returns silence
        // afterwards, so the 75-chunk hangover ends it and the decode runs.
        device.script = new int[] { 8_000, 8_000, 8_000 };
        plugin.captureDeviceSupplier = () -> device;
        plugin.lastStart = new RecordingStart();
        assertNotNull(plugin.beginSession(sessionId, plugin.lastStart));
        assertTrue("the session must reach one terminal outcome",
                awaitWithin(5_000, () -> plugin.terminalCount(sessionId) == 1));
        return plugin.terminalSummaries(sessionId);
    }

    /** Records every bridge event the plugin would have sent to the web layer. */
    private static final class TestPlugin extends ParakeetSpeechRecognitionPlugin {
        final List<RecordedEvent> events = new CopyOnWriteArrayList<>();
        RecordingStart lastStart = new RecordingStart();

        @Override
        void notifyStarted(int sessionId) {
            events.add(new RecordedEvent("started", sessionId, null, null));
        }

        @Override
        void notifyCaptureEnd(int sessionId, long capturedMs) {
            events.add(new RecordedEvent("captureEnd", sessionId, null, null));
        }

        @Override
        void notifyResult(int sessionId, String transcript) {
            events.add(new RecordedEvent("result", sessionId, null, transcript));
        }

        @Override
        void notifyError(int sessionId, String code) {
            events.add(new RecordedEvent("error", sessionId, code, null));
        }

        List<String> errors(int sessionId) {
            return sessionEvents(sessionId).stream()
                    .filter(event -> "error".equals(event.name))
                    .map(event -> event.code)
                    .collect(Collectors.toList());
        }

        List<RecordedEvent> results(int sessionId) {
            return sessionEvents(sessionId).stream()
                    .filter(event -> "result".equals(event.name))
                    .collect(Collectors.toList());
        }

        List<String> transcripts(int sessionId) {
            return sessionEvents(sessionId).stream()
                    .filter(event -> "result".equals(event.name))
                    .map(event -> event.transcript)
                    .collect(Collectors.toList());
        }

        long terminalCount(int sessionId) {
            return sessionEvents(sessionId).stream()
                    .filter(event -> "result".equals(event.name) || "error".equals(event.name))
                    .count();
        }

        List<String> terminalSummaries(int sessionId) {
            return sessionEvents(sessionId).stream()
                    .filter(event -> "result".equals(event.name) || "error".equals(event.name))
                    .map(event -> "result".equals(event.name)
                            ? "result:transcript"
                            : "error:" + event.code)
                    .collect(Collectors.toList());
        }

        private List<RecordedEvent> sessionEvents(int sessionId) {
            return events.stream()
                    .filter(event -> event.sessionId == sessionId)
                    .collect(Collectors.toList());
        }
    }

    private static final class RecordedEvent {
        final String name;
        final int sessionId;
        final String code;
        final String transcript;

        RecordedEvent(String name, int sessionId, String code, String transcript) {
            this.name = name;
            this.sessionId = sessionId;
            this.code = code;
            this.transcript = transcript;
        }
    }

    /** Fake recogniser: returns a scripted outcome, throws on demand. */
    private static final class ScriptedDecoder implements UtteranceDecoder {
        volatile DecodeOutcome outcome = DecodeOutcome.decoded("default transcript");
        volatile RuntimeException failWith;
        final AtomicInteger decodeCalls = new AtomicInteger();

        @Override
        public DecodeOutcome decode(float[] samples, int sampleRate) {
            decodeCalls.incrementAndGet();
            if (failWith != null) {
                throw failWith;
            }
            return outcome;
        }

        @Override
        public void release() {
            // Nothing to release.
        }
    }

    /** Scriptable fake capture device. */
    private static final class FakeCaptureDevice implements SpeechCaptureDevice {
        final AtomicInteger releases = new AtomicInteger();
        volatile boolean zeroReads;
        volatile int[] script = new int[0];
        private final AtomicInteger index = new AtomicInteger();

        @Override
        public boolean start() {
            return true;
        }

        @Override
        public int read(short[] buffer, int timeoutMs) {
            if (zeroReads) {
                return 0;
            }
            final int position = index.getAndIncrement();
            final int level = position < script.length ? script[position] : 0;
            if (level < 0) {
                return level;
            }
            Arrays.fill(buffer, (short) level);
            return buffer.length;
        }

        @Override
        public boolean isRecording() {
            return true;
        }

        @Override
        public void release() {
            releases.incrementAndGet();
        }
    }

    /** Records the outcome of the session's start call. */
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

    private static boolean awaitWithin(long timeoutMs, java.util.function.BooleanSupplier condition) {
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
}
