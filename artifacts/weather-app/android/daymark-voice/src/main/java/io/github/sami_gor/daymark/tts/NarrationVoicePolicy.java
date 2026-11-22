package io.github.sami_gor.daymark.tts;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Pure voice-selection policy for the bundled Kokoro engine.
 *
 * <p>One voice is packaged per supported narration language and the selected
 * Daymark interface language is the single selection input:
 *
 * <ul>
 *   <li>English → {@code bm_fable} (Misaki G2P path);</li>
 *   <li>French → {@code ff_siwis} (piper-plus-g2p French);</li>
 *   <li>Spanish → {@code em_alex} (piper-plus-g2p Latin American Spanish).</li>
 * </ul>
 *
 * <p>An unsupported language returns {@code null}: the caller must surface an
 * explicit failure instead of silently narrating English or any other voice.
 * A blank tag is the documented English default of the plugin, not a fallback
 * from a requested language. Keeping the rules in a plain Java class means the
 * JVM tests can pin them without loading the JNI library or an Android context.
 */
public final class NarrationVoicePolicy {

    public static final String ENGLISH_VOICE = "bm_fable";
    public static final String FRENCH_VOICE = "ff_siwis";
    public static final String SPANISH_VOICE = "em_alex";

    /** Voices the engine materialises from the packaged assets. */
    private static final List<String> PACKAGED_VOICES =
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
     * Voice for a narration language.
     *
     * @return the voice name, or {@code null} when the language has no
     *         packaged voice. A {@code null} result is an explicit
     *         unsupported-language failure, never a different-voice fallback.
     */
    public static String voiceForLanguage(String lang) {
        switch (languageBase(lang)) {
            case "en":
                return ENGLISH_VOICE;
            case "fr":
                return FRENCH_VOICE;
            case "es":
                return SPANISH_VOICE;
            default:
                return null;
        }
    }

    /** Voices the engine should materialise from its packaged assets. */
    public static List<String> packagedVoices() {
        return PACKAGED_VOICES;
    }

    /** True for the French/Spanish multilingual voices. */
    public static boolean isMultilingualVoice(String voiceName) {
        return FRENCH_VOICE.equals(voiceName) || SPANISH_VOICE.equals(voiceName);
    }
}
