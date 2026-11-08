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
 * <p>The policy is the compiled-in gate that keeps French/Spanish narration
 * out of production releases while the debug POC keeps it. These tests pin
 * both sides without loading the JNI library or an Android context.
 */
public class NarrationVoicePolicyTest {

    @Test
    public void englishIsAvailableInBothBuildTypes() {
        assertEquals("bm_fable",
                NarrationVoicePolicy.voiceForLanguage("en-GB", false));
        assertEquals("bm_fable",
                NarrationVoicePolicy.voiceForLanguage("en-US", true));
    }

    @Test
    public void releaseRejectsFrenchAndSpanish() {
        assertNull(NarrationVoicePolicy.voiceForLanguage("fr-FR", false));
        assertNull(NarrationVoicePolicy.voiceForLanguage("es-419", false));
        assertNull(NarrationVoicePolicy.voiceForLanguage("fr", false));
        assertNull(NarrationVoicePolicy.voiceForLanguage("es", false));
    }

    @Test
    public void debugKeepsFrenchAndSpanish() {
        assertEquals("ff_siwis",
                NarrationVoicePolicy.voiceForLanguage("fr-FR", true));
        assertEquals("em_alex",
                NarrationVoicePolicy.voiceForLanguage("es-419", true));
    }

    @Test
    public void unsupportedLanguagesAreRejectedInBothBuildTypes() {
        for (boolean multilingual : new boolean[] {false, true}) {
            assertNull(NarrationVoicePolicy.voiceForLanguage("de-DE", multilingual));
            assertNull(NarrationVoicePolicy.voiceForLanguage("ja-JP", multilingual));
        }
    }

    @Test
    public void blankLanguageFallsBackToEnglish() {
        assertEquals("bm_fable", NarrationVoicePolicy.voiceForLanguage("", false));
        assertEquals("bm_fable", NarrationVoicePolicy.voiceForLanguage(null, true));
    }

    @Test
    public void releaseMaterialisesOnlyTheEnglishVoice() {
        List<String> voices = NarrationVoicePolicy.packagedVoices(false);
        assertEquals(1, voices.size());
        assertEquals("bm_fable", voices.get(0));
        assertFalse(voices.contains("ff_siwis"));
        assertFalse(voices.contains("em_alex"));
    }

    @Test
    public void debugMaterialisesAllThreeVoices() {
        List<String> voices = NarrationVoicePolicy.packagedVoices(true);
        assertEquals(3, voices.size());
        assertTrue(voices.contains("bm_fable"));
        assertTrue(voices.contains("ff_siwis"));
        assertTrue(voices.contains("em_alex"));
    }

    @Test
    public void multilingualVoicesAreClassified() {
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

    @Test
    public void optionalVoicesRequireInstallation() {
        java.util.Set<String> none = java.util.Collections.emptySet();
        org.junit.Assert.assertNull(
                NarrationVoicePolicy.voiceForLanguage("fr-FR", true, none));
        org.junit.Assert.assertNull(
                NarrationVoicePolicy.voiceForLanguage("es-419", true, none));
        org.junit.Assert.assertEquals(
                NarrationVoicePolicy.ENGLISH_VOICE,
                NarrationVoicePolicy.voiceForLanguage("en-GB", true, none));

        java.util.Set<String> fr = new java.util.HashSet<>();
        fr.add(NarrationVoicePolicy.FRENCH_VOICE);
        org.junit.Assert.assertEquals(
                NarrationVoicePolicy.FRENCH_VOICE,
                NarrationVoicePolicy.voiceForLanguage("fr-FR", true, fr));
        org.junit.Assert.assertNull(
                NarrationVoicePolicy.voiceForLanguage("es-419", true, fr));
    }

    @Test
    public void spanishDistributionRequiresExplicitRightsApproval() {
        org.junit.Assert.assertTrue(
                NarrationVoicePolicy.isVoiceDistributable(NarrationVoicePolicy.ENGLISH_VOICE, false));
        org.junit.Assert.assertTrue(
                NarrationVoicePolicy.isVoiceDistributable(NarrationVoicePolicy.FRENCH_VOICE, false));
        org.junit.Assert.assertFalse(
                NarrationVoicePolicy.isVoiceDistributable(NarrationVoicePolicy.SPANISH_VOICE, false));
        org.junit.Assert.assertTrue(
                NarrationVoicePolicy.isVoiceDistributable(NarrationVoicePolicy.SPANISH_VOICE, true));
        org.junit.Assert.assertFalse(NarrationVoicePolicy.isVoiceDistributable("bm_george", true));
    }
}
