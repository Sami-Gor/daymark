package io.github.sami_gor.daymark.voice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

import org.junit.Test;

/**
 * JVM coverage for the evidence-keyed recognition language policy.
 *
 * <p>The bundled recogniser is evaluated for English only and no French or
 * Spanish ASR model is bundled, so the policy must honour English, reject
 * French and Spanish explicitly, and fail closed if the pinned model version
 * changes. These are the properties that keep the product from silently
 * running English recognition on French or Spanish audio.
 */
public class RecognitionLanguagePolicyTest {

    @Test
    public void evaluatedVersionMatchesPinnedModelAssets() {
        // If the pinned model is ever swapped, this fails until the language
        // evidence and the policy are reviewed together.
        assertEquals(ParakeetModelAssets.MODEL_VERSION,
                RecognitionLanguagePolicy.EVALUATED_MODEL_VERSION);
        assertTrue(RecognitionLanguagePolicy.isEvaluatedModelVersion());
        assertEquals("parakeet-tdt-0.6b-v3-int8", RecognitionLanguagePolicy.MODEL_FAMILY);
    }

    @Test
    public void supportedSetIsEnglishOnlyAndImmutable() {
        Set<String> expected = new LinkedHashSet<>(Collections.singletonList("en"));
        assertEquals(expected, RecognitionLanguagePolicy.supportedBaseLanguages());
        try {
            RecognitionLanguagePolicy.supportedBaseLanguages().add("fr");
            fail("the supported-language set must be immutable");
        } catch (UnsupportedOperationException expectedFailure) {
            // expected
        }
    }

    @Test
    public void englishTagsAreSupportedByBaseTag() {
        assertTrue(RecognitionLanguagePolicy.supports("en"));
        assertTrue(RecognitionLanguagePolicy.supports("en-GB"));
        assertTrue(RecognitionLanguagePolicy.supports("en-US"));
        assertTrue(RecognitionLanguagePolicy.supports("EN_us"));
        assertTrue(RecognitionLanguagePolicy.supports(" en-AU "));
        assertEquals("en", RecognitionLanguagePolicy.languageBase("en-GB"));
    }

    @Test
    public void frenchAndSpanishAreRejectedExplicitly() {
        assertFalse(RecognitionLanguagePolicy.supports("fr"));
        assertFalse(RecognitionLanguagePolicy.supports("fr-FR"));
        assertFalse(RecognitionLanguagePolicy.supports("fr-CA"));
        assertFalse(RecognitionLanguagePolicy.supports("es"));
        assertFalse(RecognitionLanguagePolicy.supports("es-ES"));
        assertFalse(RecognitionLanguagePolicy.supports("es-419"));
        assertFalse(RecognitionLanguagePolicy.supports("de-DE"));
    }

    @Test
    public void missingLanguageIsRejectedNotAssumedEnglish() {
        assertFalse(RecognitionLanguagePolicy.supports(null));
        assertFalse(RecognitionLanguagePolicy.supports(""));
        assertFalse(RecognitionLanguagePolicy.supports("   "));
        assertEquals("", RecognitionLanguagePolicy.languageBase(null));
        assertEquals("", RecognitionLanguagePolicy.languageBase("   "));
    }

    @Test
    public void gateFailsClosedForADifferentOrMissingModelVersion() {
        // A bumped/replaced model must not inherit the English assumption.
        assertFalse(RecognitionLanguagePolicy.supports("en", "parakeet-tdt-0.6b-v4-int8-sha256-1"));
        assertFalse(RecognitionLanguagePolicy.supports("en", ""));
        assertFalse(RecognitionLanguagePolicy.supports("en", null));
        // English is supported only under the exact evaluated version.
        assertTrue(RecognitionLanguagePolicy.supports("en",
                RecognitionLanguagePolicy.EVALUATED_MODEL_VERSION));
    }

    @Test
    public void unsupportedLanguageIsTheExplicitModelStageCodeAndNotSilence() {
        assertEquals("unsupported-language", RecognitionErrorCodes.UNSUPPORTED_LANGUAGE);
        assertEquals(RecognitionErrorCodes.Stage.MODEL,
                RecognitionErrorCodes.stageOf(RecognitionErrorCodes.UNSUPPORTED_LANGUAGE));
        // Not collapsed into a capture/empty/no-speech outcome.
        assertNotEquals(RecognitionErrorCodes.NO_SPEECH,
                RecognitionErrorCodes.UNSUPPORTED_LANGUAGE);
        assertNotEquals(RecognitionErrorCodes.EMPTY_TRANSCRIPT,
                RecognitionErrorCodes.UNSUPPORTED_LANGUAGE);
        assertNotEquals(RecognitionErrorCodes.DECODE_FAILED,
                RecognitionErrorCodes.UNSUPPORTED_LANGUAGE);
    }

    @Test
    public void everyLanguageTagHasExactlyOneBaseTag() {
        assertEquals("fr", RecognitionLanguagePolicy.languageBase("fr-CA"));
        assertEquals("es", RecognitionLanguagePolicy.languageBase("es_MX"));
        assertEquals("en", RecognitionLanguagePolicy.languageBase("en"));
        assertEquals("en", RecognitionLanguagePolicy.languageBase("EN-gb"));
        assertEquals("zh", RecognitionLanguagePolicy.languageBase("zh-Hant-TW"));
    }
}
