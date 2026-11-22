package io.github.sami_gor.daymark.voice;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Evidence-keyed policy for which recognition languages the bundled model may
 * honour.
 *
 * <p>This is the single place where the recognition language gate is declared.
 * It exists because the native engine cannot select a language for the bundled
 * model family: the shipped sherpa-onnx {@code OfflineRecognizer} API exposes no
 * language parameter on its decode path, and the offline NeMo-transducer model
 * loader reads no language or {@code is_multilingual} metadata (only
 * {@code vocab_size}, {@code subsampling_factor}, {@code normalize_type},
 * {@code pred_rnn_layers}, {@code pred_hidden}, {@code is_giga_am},
 * {@code feat_dim} and {@code url}). Language selection therefore has to be a
 * gate in front of capture, backed by evidence, not a runtime prompt.
 *
 * <p>The supported-language set is deliberately empty unless the installed
 * model version is exactly the version the set was evaluated against. If
 * {@link ParakeetModelAssets#MODEL_VERSION} is bumped (for example to ship a
 * different or per-language model) the gate fails closed: every language,
 * including English, becomes explicitly unsupported until the evidence and this
 * policy are updated together. A language is never silently assumed just
 * because the model changed.
 *
 * <p>Current evidence basis (see the round-12 evidence bundle):
 *
 * <ul>
 *   <li>the only bundled/pinned ASR model is
 *       {@code parakeet-tdt-0.6b-v3-int8} (encoder/decoder/joiner/tokens, all
 *       SHA-256 pinned in {@link ParakeetModelAssets});</li>
 *   <li>the only recognition evaluation on record is English-language audio,
 *       and the V2 candidate documents describe Android recognition as English
 *       (French/Spanish narration and recognition are out of the V2 scope);</li>
 *   <li>no French or Spanish ASR model, model archive or fetch path exists in
 *       this repository, so French/Spanish recognition cannot be implemented
 *       honestly for this build.</li>
 * </ul>
 *
 * <p>French and Spanish are therefore rejected with the stable explicit code
 * {@code unsupported-language} before the microphone opens. Nothing falls back
 * to English recognition, to {@code android.speech}, to the web speech API or to
 * any network recogniser.
 */
final class RecognitionLanguagePolicy {

    /**
     * Model family this policy was written for. Recorded so a future model
     * swap is an explicit review point, not an implicit assumption.
     */
    static final String MODEL_FAMILY = "parakeet-tdt-0.6b-v3-int8";

    /**
     * The exact {@link ParakeetModelAssets#MODEL_VERSION} the supported set was
     * evaluated against. Must stay in step with the pinned assets; the JVM
     * tests fail if it drifts.
     */
    static final String EVALUATED_MODEL_VERSION = "parakeet-tdt-0.6b-v3-int8-sha256-1";

    /**
     * Base language tags the evaluated model configuration may honour. English
     * only: it is the only language with recognition evidence for this model,
     * and no French or Spanish ASR model is bundled.
     */
    private static final Set<String> SUPPORTED_BASE_LANGUAGES;

    static {
        Set<String> supported = new LinkedHashSet<>();
        supported.add("en");
        SUPPORTED_BASE_LANGUAGES = Collections.unmodifiableSet(supported);
    }

    private RecognitionLanguagePolicy() {
    }

    /**
     * Base language tag of a BCP-47 style value, lower-cased, or {@code ""}
     * for a blank/missing tag.
     */
    static String languageBase(String lang) {
        if (lang == null || lang.trim().isEmpty()) {
            return "";
        }
        return lang.trim().toLowerCase(Locale.ROOT).split("[-_]", 2)[0];
    }

    /** Immutable set of base language tags the evaluated model may honour. */
    static Set<String> supportedBaseLanguages() {
        return SUPPORTED_BASE_LANGUAGES;
    }

    /**
     * Whether the currently bundled model version is the version this policy's
     * language evidence covers. False fails the gate closed.
     */
    static boolean isEvaluatedModelVersion() {
        return EVALUATED_MODEL_VERSION.equals(ParakeetModelAssets.MODEL_VERSION);
    }

    /**
     * Whether the bundled recogniser may honour the given language tag under
     * the currently packaged model version.
     */
    static boolean supports(String lang) {
        return supports(lang, ParakeetModelAssets.MODEL_VERSION);
    }

    /**
     * Whether a recogniser built from {@code modelVersion} may honour the given
     * language tag. Package-private seam so the fail-closed behaviour can be
     * tested against a different, hypothetical model version without touching
     * the pinned assets.
     */
    static boolean supports(String lang, String modelVersion) {
        if (modelVersion == null || !EVALUATED_MODEL_VERSION.equals(modelVersion)) {
            return false;
        }
        String base = languageBase(lang);
        return !base.isEmpty() && SUPPORTED_BASE_LANGUAGES.contains(base);
    }
}
