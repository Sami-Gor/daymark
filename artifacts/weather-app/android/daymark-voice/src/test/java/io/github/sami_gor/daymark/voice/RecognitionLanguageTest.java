package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class RecognitionLanguageTest {

    @Test
    public void normalizesSupportedLocales() {
        assertEquals("en-GB", RecognitionLanguage.normalize("en"));
        assertEquals("en-GB", RecognitionLanguage.normalize("en-US"));
        assertEquals("fr-FR", RecognitionLanguage.normalize("fr"));
        assertEquals("fr-FR", RecognitionLanguage.normalize("fr-CA"));
        assertEquals("es-ES", RecognitionLanguage.normalize("es"));
        assertEquals("es-ES", RecognitionLanguage.normalize("es-419"));
    }

    @Test
    public void rejectsMissingOrUnsupportedLocales() {
        assertNull(RecognitionLanguage.normalize(null));
        assertNull(RecognitionLanguage.normalize(""));
        assertNull(RecognitionLanguage.normalize("   "));
        assertNull(RecognitionLanguage.normalize("de"));
        assertNull(RecognitionLanguage.normalize("zh-Hans"));
    }
}
