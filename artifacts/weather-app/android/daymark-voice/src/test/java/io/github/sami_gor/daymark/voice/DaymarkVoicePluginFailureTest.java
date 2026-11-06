package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class DaymarkVoicePluginFailureTest {

    @Test
    public void classifiesAssetIntegrityFailures() {
        assertEquals(
                "voice-asset-invalid",
                DaymarkVoicePlugin.classifyFailure(
                        "Kokoro asset integrity mismatch for em_alex.bin"));
        assertEquals(
                "voice-asset-invalid",
                DaymarkVoicePlugin.classifyFailure("voice file missing"));
    }

    @Test
    public void classifiesSynthesisAndPlaybackFailures() {
        assertEquals(
                "synthesis-failed",
                DaymarkVoicePlugin.classifyFailure("Synthesis returned no audio"));
        assertEquals(
                "playback-failed",
                DaymarkVoicePlugin.classifyFailure("AudioTrack.write failed: -4"));
    }

    @Test
    public void classifiesInitializationAndLanguageFailures() {
        assertEquals(
                "model-init-failed",
                DaymarkVoicePlugin.classifyFailure("Initialization failed: model load failed"));
        assertEquals(
                "model-init-failed",
                DaymarkVoicePlugin.classifyFailure("engine not ready"));
        assertEquals(
                "unsupported-language",
                DaymarkVoicePlugin.classifyFailure("Unsupported narration language: de-DE"));
    }

    @Test
    public void keepsUnknownFailuresOpaque() {
        assertEquals("native-failed", DaymarkVoicePlugin.classifyFailure(null));
        assertEquals("native-failed", DaymarkVoicePlugin.classifyFailure("opaque failure"));
    }
}
