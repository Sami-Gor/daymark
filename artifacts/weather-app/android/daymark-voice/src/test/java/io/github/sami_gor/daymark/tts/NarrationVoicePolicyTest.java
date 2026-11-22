package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.List;

import org.junit.Test;

/**
 * Plain JVM coverage for {@link NarrationVoicePolicy}.
 *
 * <p>The policy is the compiled-in rule that binds the selected Daymark
 * interface language to exactly one packaged voice. These tests pin that
 * mapping, the explicit unsupported-language result and the packaged voice
 * inventory without loading the JNI library or an Android context.
 */
public class NarrationVoicePolicyTest {

    @Test
    public void eachSupportedLanguageMapsToItsPackagedVoice() {
        assertEquals("bm_fable", NarrationVoicePolicy.voiceForLanguage("en-GB"));
        assertEquals("bm_fable", NarrationVoicePolicy.voiceForLanguage("en-US"));
        assertEquals("ff_siwis", NarrationVoicePolicy.voiceForLanguage("fr-FR"));
        assertEquals("ff_siwis", NarrationVoicePolicy.voiceForLanguage("fr-CA"));
        assertEquals("em_alex", NarrationVoicePolicy.voiceForLanguage("es-419"));
        assertEquals("em_alex", NarrationVoicePolicy.voiceForLanguage("es-ES"));
    }

    @Test
    public void unsupportedLanguagesAreRejectedNotFallenBack() {
        assertNull(NarrationVoicePolicy.voiceForLanguage("de-DE"));
        assertNull(NarrationVoicePolicy.voiceForLanguage("ja-JP"));
        assertNull(NarrationVoicePolicy.voiceForLanguage("it"));
    }

    @Test
    public void blankLanguageIsTheDocumentedEnglishDefault() {
        assertEquals("bm_fable", NarrationVoicePolicy.voiceForLanguage(""));
        assertEquals("bm_fable", NarrationVoicePolicy.voiceForLanguage(null));
        assertEquals("bm_fable", NarrationVoicePolicy.voiceForLanguage("   "));
    }

    @Test
    public void allThreeLanguagesAndVoicesArePackaged() {
        List<String> voices = NarrationVoicePolicy.packagedVoices();
        assertEquals(3, voices.size());
        assertTrue(voices.contains("bm_fable"));
        assertTrue(voices.contains("ff_siwis"));
        assertTrue(voices.contains("em_alex"));
        assertTrue(NarrationVoicePolicy.isMultilingualVoice("ff_siwis"));
        assertTrue(NarrationVoicePolicy.isMultilingualVoice("em_alex"));
        assertFalse(NarrationVoicePolicy.isMultilingualVoice("bm_fable"));
    }

    @Test
    public void languageBaseIsNormalised() {
        assertEquals("en", NarrationVoicePolicy.languageBase(null));
        assertEquals("en", NarrationVoicePolicy.languageBase("   "));
        assertEquals("en", NarrationVoicePolicy.languageBase("EN-gb"));
        assertEquals("fr", NarrationVoicePolicy.languageBase("fr_FR"));
        assertEquals("es", NarrationVoicePolicy.languageBase("es-419"));
    }
}
