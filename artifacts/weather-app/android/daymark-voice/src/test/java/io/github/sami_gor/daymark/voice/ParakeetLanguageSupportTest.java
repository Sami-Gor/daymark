package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * JVM coverage for the recognition language gate.
 *
 * <p>The bundled Parakeet recogniser is one fixed English transducer, so the
 * native plugin must honor English and reject every other language explicitly
 * with {@code unsupported-language}. This is the no-silent-fallback contract;
 * it is checked on the JVM because no device is attached.
 */
public class ParakeetLanguageSupportTest {

    @Test
    public void englishTagsAreSupportedByBaseTag() {
        assertTrue(ParakeetSpeechRecognitionPlugin.supportsLanguage("en"));
        assertTrue(ParakeetSpeechRecognitionPlugin.supportsLanguage("en-GB"));
        assertTrue(ParakeetSpeechRecognitionPlugin.supportsLanguage("en-US"));
        assertTrue(ParakeetSpeechRecognitionPlugin.supportsLanguage("EN_us"));
        assertEquals("en", ParakeetSpeechRecognitionPlugin.languageBase("en-GB"));
    }

    @Test
    public void frenchAndSpanishAreRejectedExplicitly() {
        assertFalse(ParakeetSpeechRecognitionPlugin.supportsLanguage("fr-FR"));
        assertFalse(ParakeetSpeechRecognitionPlugin.supportsLanguage("es-419"));
        assertFalse(ParakeetSpeechRecognitionPlugin.supportsLanguage("es-ES"));
        assertFalse(ParakeetSpeechRecognitionPlugin.supportsLanguage("de-DE"));
    }

    @Test
    public void missingLanguageIsRejectedNotAssumedEnglish() {
        assertFalse(ParakeetSpeechRecognitionPlugin.supportsLanguage(null));
        assertFalse(ParakeetSpeechRecognitionPlugin.supportsLanguage(""));
        assertFalse(ParakeetSpeechRecognitionPlugin.supportsLanguage("   "));
        assertEquals("", ParakeetSpeechRecognitionPlugin.languageBase(null));
    }

    @Test
    public void unsupportedLanguageIsAModelStageCode() {
        assertEquals("unsupported-language", RecognitionErrorCodes.UNSUPPORTED_LANGUAGE);
        assertEquals(RecognitionErrorCodes.Stage.MODEL,
                RecognitionErrorCodes.stageOf(RecognitionErrorCodes.UNSUPPORTED_LANGUAGE));
    }

    @Test
    public void everyLanguageTagHasExactlyOneBaseTag() {
        assertEquals("fr", ParakeetSpeechRecognitionPlugin.languageBase("fr-CA"));
        assertEquals("es", ParakeetSpeechRecognitionPlugin.languageBase("es_MX"));
    }
}
