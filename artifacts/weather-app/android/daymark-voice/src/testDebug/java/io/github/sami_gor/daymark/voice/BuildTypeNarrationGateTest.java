package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import io.github.sami_gor.daymark.tts.NarrationVoicePolicy;

import org.junit.Test;

/** Compiled-flag check for the debug POC variant. */
public class BuildTypeNarrationGateTest {

    @Test
    public void debugCompilesMultilingualNarration() {
        assertTrue(BuildConfig.MULTILINGUAL_NARRATION);
        assertEquals("ff_siwis", NarrationVoicePolicy.voiceForLanguage(
                "fr-FR", BuildConfig.MULTILINGUAL_NARRATION));
        assertEquals("em_alex", NarrationVoicePolicy.voiceForLanguage(
                "es-419", BuildConfig.MULTILINGUAL_NARRATION));
    }
}
