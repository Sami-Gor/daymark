package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class VoicePluginFailureClassificationTest {

    @Test
    public void nativeLibraryFailureIsNotReportedAsModelInitFailure() {
        assertEquals("native-unavailable",
                DaymarkVoicePlugin.classifyFailure("Initialization failed: native-unavailable"));
        assertEquals("native-unavailable",
                DaymarkVoicePlugin.classifyFailure("Initialization failed: native-blocked"));
    }

    @Test
    public void unsupportedLanguageStaysDistinct() {
        assertEquals("unsupported-language",
                DaymarkVoicePlugin.classifyFailure("Unsupported narration language: fr-FR"));
    }
}
