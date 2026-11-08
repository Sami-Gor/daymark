package io.github.sami_gor.daymark.packs;

import java.util.Locale;

/**
 * Licence and attribution policy for optional narration packs.
 *
 * <p>An attribution string is metadata, not proof of a licence. The pack
 * manager therefore requires the pack manifest to carry the licence identity,
 * the licence URL, the attribution text and an explicit rights status. A pack
 * may only be marked distributable when {@code rights} is {@code cleared} and
 * the pack is not marked development-only.
 *
 * <p>The French {@code ff_siwis} voice is derived from the SIWIS corpus and is
 * distributed under CC BY 4.0; its notice must identify SIWIS and the DataShare
 * DOI {@code 10.7488/ds/1705}. The Spanish {@code em_alex} voice is distributed
 * under Apache-2.0; its notice must include the Apache-2.0 licence text/URL.
 *
 * <p>Current V2.1 release handling: the Spanish voice rights remain unresolved
 * in the pack manifest, so that manifest must set {@code developmentOnly=true}.
 * It is never reported as distributable, and {@link PackDownloader} refuses it
 * unless the caller explicitly opts into development-only packs.
 */
public final class PackLicences {

    public static final String RIGHTS_CLEARED = "cleared";
    public static final String RIGHTS_UNRESOLVED = "unresolved";

    public static final String FRENCH_VOICE = "ff_siwis";
    public static final String FRENCH_LICENCE_SPDX = "CC-BY-4.0";
    public static final String FRENCH_LICENCE_NAME =
            "Creative Commons Attribution 4.0 International";
    public static final String FRENCH_LICENCE_URL =
            "https://creativecommons.org/licenses/by/4.0/";

    public static final String FRENCH_ATTRIBUTION =
            "Voice style: ff_siwis. Source corpus: The SIWIS French Speech Synthesis "
                    + "Database (2016), University of Edinburgh, School of Informatics, "
                    + "The Centre for Speech Technology Research, "
                    + "https://doi.org/10.7488/ds/1705 (DataShare record 10283/2353), "
                    + "licensed under CC BY 4.0.";

    public static final String FRENCH_NOTICE =
            FRENCH_ATTRIBUTION
                    + " The voice style is published by hexgrad in Kokoro-82M and "
                    + "converted to ONNX .bin by onnx-community/Kokoro-82M-v1.0-ONNX. "
                    + "Daymark redistributes the exact .bin file unmodified; the only "
                    + "known transformation is the upstream voice-style conversion. "
                    + "Daymark does not claim that the voice or corpus was modified for "
                    + "Daymark. Licence: Creative Commons Attribution 4.0 International "
                    + "(CC BY 4.0), https://creativecommons.org/licenses/by/4.0/.";

    public static final String SPANISH_VOICE = "em_alex";
    public static final String SPANISH_LICENCE_SPDX = "Apache-2.0";
    public static final String SPANISH_LICENCE_NAME = "Apache License, Version 2.0";
    public static final String SPANISH_LICENCE_URL =
            "https://www.apache.org/licenses/LICENSE-2.0";

    public static final String SPANISH_ATTRIBUTION =
            "Kokoro-82M Spanish voice em_alex, published by hexgrad in Kokoro-82M, "
                    + "converted to ONNX .bin by onnx-community/Kokoro-82M-v1.0-ONNX and "
                    + "redistributed unmodified by Daymark under the Apache License, "
                    + "Version 2.0. Daymark does not claim speaker endorsement or "
                    + "identity.";

    public static final String SPANISH_NOTICE =
            SPANISH_ATTRIBUTION
                    + " A copy of the Apache License, Version 2.0 "
                    + "(https://www.apache.org/licenses/LICENSE-2.0) must accompany "
                    + "distribution. Source voice file: voices/em_alex.pt; the "
                    + "redistributed ONNX voice file is identified by its SHA-256 in "
                    + "the manifest. The only known transformation is the upstream "
                    + "PyTorch-to-ONNX conversion.";

    private PackLicences() {
    }

    /**
     * Validates the voice-specific licence requirements.
     *
     * @return {@code null} when the metadata is acceptable, otherwise a stable
     *         violation reason for a manifest validation error.
     */
    static String violation(
            String voiceId,
            String spdx,
            String name,
            String url,
            String attribution,
            String notice) {
        String text = (attribution + "\n" + notice).toLowerCase(Locale.ROOT);
        if (FRENCH_VOICE.equals(voiceId)) {
            if (!FRENCH_LICENCE_SPDX.equals(spdx)) {
                return "ff_siwis must be licensed as " + FRENCH_LICENCE_SPDX;
            }
            if (!name.toLowerCase(Locale.ROOT).contains("creative commons attribution 4.0")) {
                return "ff_siwis licence name must identify CC BY 4.0";
            }
            if (!url.startsWith("https://creativecommons.org/licenses/by/4.0")) {
                return "ff_siwis licence URL must point at CC BY 4.0";
            }
            if (!text.contains("siwis")) {
                return "ff_siwis attribution must name the SIWIS corpus";
            }
            if (!text.contains("10.7488/ds/1705")) {
                return "ff_siwis attribution must include the SIWIS DOI 10.7488/ds/1705";
            }
            if (!text.contains("cc by 4.0")
                    && !text.contains("creative commons attribution 4.0")) {
                return "ff_siwis attribution must state CC BY 4.0";
            }
            return null;
        }
        if (SPANISH_VOICE.equals(voiceId)) {
            if (!SPANISH_LICENCE_SPDX.equals(spdx)) {
                return "em_alex must be licensed as " + SPANISH_LICENCE_SPDX;
            }
            if (!name.toLowerCase(Locale.ROOT).contains("apache license")) {
                return "em_alex licence name must identify the Apache License";
            }
            if (!url.startsWith("https://www.apache.org/licenses/")) {
                return "em_alex licence URL must point at Apache-2.0";
            }
            if (!text.contains("apache license")) {
                return "em_alex attribution must include the Apache License text reference";
            }
            if (!text.contains("kokoro")) {
                return "em_alex attribution must identify its Kokoro-82M source";
            }
            return null;
        }
        return "no licence policy for voice " + voiceId;
    }
}
