package io.github.sami_gor.daymark.tts;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Pure voice-selection policy for the bundled Kokoro engine.
 *
 * <p>Production releases are English-only. French and Spanish narration is a
 * debug-POC capability, gated by the {@code BuildConfig.MULTILINGUAL_NARRATION}
 * flag at the call site. Keeping the rules in a plain Java class means the JVM
 * tests can pin both the debug and release behaviour without loading the JNI
 * library or an Android context.
 */
public final class NarrationVoicePolicy {

    public static final String ENGLISH_VOICE = "bm_fable";
    public static final String FRENCH_VOICE = "ff_siwis";
    public static final String SPANISH_VOICE = "em_alex";

    private static final List<String> ENGLISH_ONLY =
            Collections.unmodifiableList(Arrays.asList(ENGLISH_VOICE));
    private static final List<String> MULTILINGUAL =
            Collections.unmodifiableList(Arrays.asList(
                    ENGLISH_VOICE, FRENCH_VOICE, SPANISH_VOICE));

    private NarrationVoicePolicy() {
    }

    /** Locale base tag, or {@code "en"} when the tag is blank. */
    public static String languageBase(String lang) {
        if (lang == null || lang.trim().isEmpty()) {
            return "en";
        }
        return lang.trim().toLowerCase().split("[-_]", 2)[0];
    }

    /**
     * Voice for a narration locale.
     *
     * @param multilingualNarration release builds pass {@code false}; debug
     *                              POC builds pass {@code true}.
     * @return the voice name, or {@code null} when this build must not narrate
     *         the locale.
     */
    public static String voiceForLanguage(String lang, boolean multilingualNarration) {
        return voiceForLanguage(lang, multilingualNarration,
                multilingualNarration ? MULTILINGUAL : ENGLISH_ONLY);
    }

    /**
     * Voice for a narration locale, requiring the optional voice to be present.
     *
     * <p>French and Spanish are optional packs: enabling multilingual narration
     * is not enough, the voice file must be installed. Missing voices return
     * {@code null} so the caller reports a pack error instead of falling back to
     * English.
     */
    public static String voiceForLanguage(
            String lang, boolean multilingualNarration, java.util.Collection<String> installedVoices) {
        switch (languageBase(lang)) {
            case "en":
                return ENGLISH_VOICE;
            case "fr":
                return multilingualNarration && installedVoices.contains(FRENCH_VOICE) ? FRENCH_VOICE : null;
            case "es":
                return multilingualNarration && installedVoices.contains(SPANISH_VOICE) ? SPANISH_VOICE : null;
            default:
                return null;
        }
    }

    /**
     * Voices the engine should materialise from its packaged assets.
     *
     * <p>A release build must never copy, or depend on, the multilingual voice
     * files, even if one was accidentally left in the APK.
     */
    public static List<String> packagedVoices(boolean multilingualNarration) {
        return multilingualNarration ? MULTILINGUAL : ENGLISH_ONLY;
    }

    /**
     * Whether a voice may be distributed in a release build.
     *
     * <p>English and French are cleared. Spanish ({@code em_alex}) has an
     * Apache-2.0 file notice but no written speaker/likeness rights evidence,
     * so it stays development-only until the owner supplies that evidence.
     * This is a distribution gate, not a language gate: it must not be removed
     * by a build-type flag alone.
     */
    public static boolean isVoiceDistributable(String voiceId, boolean spanishDistributionApproved) {
        if (ENGLISH_VOICE.equals(voiceId) || FRENCH_VOICE.equals(voiceId)) {
            return true;
        }
        if (SPANISH_VOICE.equals(voiceId)) {
            return spanishDistributionApproved;
        }
        return false;
    }

    /** True for the French/Spanish voices that are debug-POC only. */
    public static boolean isMultilingualVoice(String voiceName) {
        return FRENCH_VOICE.equals(voiceName) || SPANISH_VOICE.equals(voiceName);
    }
}
