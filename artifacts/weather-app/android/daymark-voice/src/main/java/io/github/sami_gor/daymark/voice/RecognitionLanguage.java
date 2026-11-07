package io.github.sami_gor.daymark.voice;

import java.util.Locale;

/**
 * Canonical language tags for on-device recognition.
 *
 * <p>The recogniser itself performs automatic language identification (the
 * Parakeet TDT v3 model is multilingual); this class deliberately does not
 * pretend to pin a language. It rejects unknown locales so a missing or
 * malformed tag fails visibly instead of being decoded as English.
 */
public final class RecognitionLanguage {

    private RecognitionLanguage() {
    }

    /** Returns the canonical tag for a Daymark locale, or {@code null} if unsupported. */
    public static String normalize(String lang) {
        if (lang == null) {
            return null;
        }
        String trimmed = lang.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        String base = trimmed.split("[-_]")[0].toLowerCase(Locale.ROOT);
        switch (base) {
            case "en":
                return "en-GB";
            case "fr":
                return "fr-FR";
            case "es":
                return "es-ES";
            default:
                return null;
        }
    }
}
