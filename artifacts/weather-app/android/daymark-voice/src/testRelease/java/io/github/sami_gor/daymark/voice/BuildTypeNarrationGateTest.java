package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import io.github.sami_gor.daymark.tts.NarrationVoicePolicy;

import java.util.Collections;
import java.util.HashSet;

import org.junit.Test;

/** Compiled-flag check for the production release variant. */
public class BuildTypeNarrationGateTest {

    @Test
    public void releaseEnablesMultilingualNarrationButPackagesEnglishOnly() {
        assertTrue(BuildConfig.MULTILINGUAL_NARRATION);
        assertFalse(BuildConfig.PACKAGED_MULTILINGUAL_VOICES);
        assertEquals(1, NarrationVoicePolicy.packagedVoices(
                BuildConfig.PACKAGED_MULTILINGUAL_VOICES).size());
    }

    @Test
    public void optionalVoicesRequireInstallationAndNeverFallBackToEnglish() {
        assertNull(NarrationVoicePolicy.voiceForLanguage(
                "fr-FR", BuildConfig.MULTILINGUAL_NARRATION, Collections.<String>emptySet()));
        assertNull(NarrationVoicePolicy.voiceForLanguage(
                "es-419", BuildConfig.MULTILINGUAL_NARRATION, Collections.<String>emptySet()));
        assertEquals("bm_fable", NarrationVoicePolicy.voiceForLanguage(
                "en-GB", BuildConfig.MULTILINGUAL_NARRATION, Collections.<String>emptySet()));
    }

    @Test
    public void installedOptionalVoicesAreSelectable() {
        HashSet<String> installed = new HashSet<>();
        installed.add(NarrationVoicePolicy.FRENCH_VOICE);
        assertEquals("ff_siwis", NarrationVoicePolicy.voiceForLanguage(
                "fr-FR", BuildConfig.MULTILINGUAL_NARRATION, installed));
        assertNull(NarrationVoicePolicy.voiceForLanguage(
                "es-419", BuildConfig.MULTILINGUAL_NARRATION, installed));
    }

    @Test
    public void releaseBlocksSpanishDistributionUntilRightsEvidenceExists() {
        assertFalse(BuildConfig.SPANISH_VOICE_DISTRIBUTION_APPROVED);
        assertFalse(NarrationVoicePolicy.isVoiceDistributable(
                NarrationVoicePolicy.SPANISH_VOICE,
                BuildConfig.SPANISH_VOICE_DISTRIBUTION_APPROVED));
        assertTrue(NarrationVoicePolicy.isVoiceDistributable(
                NarrationVoicePolicy.FRENCH_VOICE,
                BuildConfig.SPANISH_VOICE_DISTRIBUTION_APPROVED));
    }
}
