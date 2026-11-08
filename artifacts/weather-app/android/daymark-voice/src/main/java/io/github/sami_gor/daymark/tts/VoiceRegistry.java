package io.github.sami_gor.daymark.tts;

import java.io.File;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Pure-Java catalog of the optional Kokoro narration voices.
 *
 * <p>The runtime only ever reads voice files from the engine's own
 * {@code filesDir/kokoro} directory. Callers (the pack manager) must have
 * verified a signed manifest and the file digest before calling in; this class
 * validates identity, path shape and basic readability so invalid input never
 * reaches the native engine.
 *
 * <p>No network access, no arbitrary paths, no silent English substitution.
 */
public final class VoiceRegistry {

    public static final String ENGLISH = NarrationVoicePolicy.ENGLISH_VOICE;
    public static final String FRENCH = NarrationVoicePolicy.FRENCH_VOICE;
    public static final String SPANISH = NarrationVoicePolicy.SPANISH_VOICE;

    private static final Set<String> SUPPORTED = Collections.unmodifiableSet(
            new LinkedHashSet<>(java.util.Arrays.asList(ENGLISH, FRENCH, SPANISH)));

    private VoiceRegistry() {
    }

    public static boolean isSupported(String voiceId) {
        return voiceId != null && SUPPORTED.contains(voiceId);
    }

    /** Canonical file for a supported optional voice, or null when unsupported. */
    public static File fileFor(File voicesDir, String voiceId) {
        if (voicesDir == null || !isSupported(voiceId)) {
            return null;
        }
        File file = new File(voicesDir, voiceId + ".bin");
        try {
            String root = voicesDir.getCanonicalPath();
            String candidate = file.getCanonicalPath();
            if (!candidate.startsWith(root + File.separator)) {
                return null;
            }
        } catch (java.io.IOException e) {
            return null;
        }
        return file;
    }

    /** True when the voice file exists and is not empty. */
    public static boolean isInstalled(File voicesDir, String voiceId) {
        File file = fileFor(voicesDir, voiceId);
        return file != null && file.isFile() && file.length() > 0;
    }

    /** Supported voices present on disk, in a deterministic order. */
    public static Set<String> installed(File voicesDir) {
        Set<String> found = new LinkedHashSet<>();
        for (String voice : SUPPORTED) {
            if (isInstalled(voicesDir, voice)) {
                found.add(voice);
            }
        }
        return found;
    }

    /**
     * Error kind for a voice request, or null when the voice is usable.
     * Stable values are returned to callers as error codes.
     */
    public static String unavailableReason(File voicesDir, String voiceId) {
        if (!isSupported(voiceId)) {
            return "unsupported-voice";
        }
        File file = fileFor(voicesDir, voiceId);
        if (file == null) {
            return "invalid-path";
        }
        if (!file.exists()) {
            return "voice-not-installed";
        }
        if (!file.isFile()) {
            return "voice-unreadable";
        }
        if (file.length() == 0) {
            return "voice-corrupt";
        }
        return null;
    }

    /** Optional voices that were installed after the engine last loaded its set. */
    public static Set<String> newlyInstalled(File voicesDir, Set<String> loaded) {
        Set<String> result = new LinkedHashSet<>();
        for (String voice : installed(voicesDir)) {
            if (loaded == null || !loaded.contains(voice)) {
                result.add(voice);
            }
        }
        return result;
    }
}
