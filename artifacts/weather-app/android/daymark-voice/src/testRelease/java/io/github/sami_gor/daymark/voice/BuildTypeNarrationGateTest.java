package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;

import io.github.sami_gor.daymark.tts.NarrationVoicePolicy;

import org.junit.Test;

/** Compiled-flag check for the production release variant. */
public class BuildTypeNarrationGateTest {

    @Test
    public void releaseCompilesEnglishOnlyNarration() {
        assertFalse(BuildConfig.MULTILINGUAL_NARRATION);
        assertNull(NarrationVoicePolicy.voiceForLanguage(
                "fr-FR", BuildConfig.MULTILINGUAL_NARRATION));
        assertNull(NarrationVoicePolicy.voiceForLanguage(
                "es-419", BuildConfig.MULTILINGUAL_NARRATION));
        assertEquals("bm_fable", NarrationVoicePolicy.voiceForLanguage(
                "en-GB", BuildConfig.MULTILINGUAL_NARRATION));
        assertEquals(1, NarrationVoicePolicy.packagedVoices(
                BuildConfig.MULTILINGUAL_NARRATION).size());
    }
}
