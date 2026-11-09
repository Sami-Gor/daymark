package io.github.sami_gor.daymark.packs;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Immutable, validated description of where optional narration packs come from.
 *
 * <p>The web layer never chooses a pack URL or a voice identifier. Both are
 * compiled into the app variant (or injected at build time) and validated here:
 *
 * <ul>
 *   <li>the base URL is HTTPS, has no credentials, query or fragment, and has a
 *       path that cannot escape itself;</li>
 *   <li>the trust anchor is a pinned raw Ed25519 public key — never a private
 *       key and never a key fetched next to the manifest it authenticates;</li>
 *   <li>only explicitly allowed optional voices can produce URLs. English
 *       ({@code bm_fable}) is built in and is not downloadable.</li>
 * </ul>
 *
 * <p>An empty configuration is a hard failure, not a permissive default. Release
 * builds therefore fail closed until release engineering supplies the production
 * URL and public key: {@link #fromBuildConfig(String, String, String)} throws
 * {@link ConfigurationException} with reason {@code packs-unconfigured}.
 *
 * <p>This class has no network code. {@link VoicePackManager} derives every URL
 * through it, so a caller can never pass an arbitrary URL or voice to the
 * downloader.
 */
public final class PackSourceConfig {

    /** Stable reason for an empty/invalid source configuration. */
    public static final String UNCONFIGURED = "packs-unconfigured";

    /**
     * Known catalog payload size for the optional Kokoro voices (both published
     * {@code .bin} files are 522,240 bytes). The signed manifest remains the
     * authoritative size at install time; this value only drives the settings
     * row before the first download.
     */
    public static final long KNOWN_PAYLOAD_BYTES = 522_240L;

    private static final String MANIFEST_PATH = "manifest.json";
    private static final String SIGNATURE_PATH = "manifest.json.sig";
    private static final int MAX_ANCHOR_HEX = 64;

    /** Thrown when the compiled-in source configuration is unusable. */
    public static final class ConfigurationException extends Exception {
        /** Stable code for the bridge/UI; never contains a URL or key. */
        public final String reason;

        ConfigurationException(String reason, String message) {
            super(message);
            this.reason = reason;
        }
    }

    /** One download-allowed optional voice. */
    public static final class VoiceSource {
        private final String voiceId;
        private final String packId;
        private final String language;
        private final long sizeBytes;

        VoiceSource(String voiceId, String packId, String language, long sizeBytes) {
            this.voiceId = voiceId;
            this.packId = packId;
            this.language = language;
            this.sizeBytes = sizeBytes;
        }

        public String voiceId() {
            return voiceId;
        }

        public String packId() {
            return packId;
        }

        /** Base language tag used by the UI, for example {@code fr}. */
        public String language() {
            return language;
        }

        /** Known catalog size; the signed manifest wins during installation. */
        public long sizeBytes() {
            return sizeBytes;
        }
    }

    private final String baseUrl;
    private final String baseAuthority;
    private final String basePath;
    private final PackTrustAnchor trustAnchor;
    private final Map<String, VoiceSource> voices;

    private PackSourceConfig(
            String baseUrl,
            String baseAuthority,
            String basePath,
            PackTrustAnchor trustAnchor,
            Map<String, VoiceSource> voices) {
        this.baseUrl = baseUrl;
        this.baseAuthority = baseAuthority;
        this.basePath = basePath;
        this.trustAnchor = trustAnchor;
        this.voices = Collections.unmodifiableMap(new LinkedHashMap<>(voices));
    }

    /**
     * Builds a validated configuration.
     *
     * @param baseUrl         HTTPS base, for example
     *                        {@code https://packs.example.daymark/v21}; an empty
     *                        value fails closed.
     * @param anchorHex       exactly 64 hex characters encoding the raw 32-byte
     *                        Ed25519 public key; an empty value fails closed.
     * @param allowedVoiceIds comma-separated optional voice ids; an empty value
     *                        fails closed.
     */
    public static PackSourceConfig fromBuildConfig(
            String baseUrl, String anchorHex, String allowedVoiceIds)
            throws ConfigurationException {
        if (isBlank(baseUrl) || isBlank(anchorHex) || isBlank(allowedVoiceIds)) {
            throw new ConfigurationException(UNCONFIGURED,
                    "narration pack source is not configured for this build");
        }
        final URI uri;
        try {
            uri = new URI(baseUrl.trim());
        } catch (URISyntaxException e) {
            throw new ConfigurationException("invalid-pack-source", "pack base URL is malformed");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new ConfigurationException("insecure-pack-source",
                    "pack base URL must use HTTPS");
        }
        if (uri.getHost() == null || uri.getHost().trim().isEmpty()) {
            throw new ConfigurationException("invalid-pack-source",
                    "pack base URL has no host");
        }
        if (uri.getUserInfo() != null) {
            throw new ConfigurationException("credentials-in-pack-source",
                    "pack base URL must not contain credentials");
        }
        if (uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new ConfigurationException("invalid-pack-source",
                    "pack base URL must not contain a query or fragment");
        }
        String path = uri.getRawPath() == null ? "" : uri.getRawPath();
        if (!path.isEmpty() && !path.startsWith("/")) {
            throw new ConfigurationException("invalid-pack-source",
                    "pack base URL path must be absolute");
        }
        while (path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        if (!isSafeBasePath(path)) {
            throw new ConfigurationException("invalid-pack-source",
                    "pack base URL path contains traversal or unsafe characters");
        }
        String authority = uri.getRawAuthority();
        if (authority == null || authority.trim().isEmpty()) {
            throw new ConfigurationException("invalid-pack-source",
                    "pack base URL has no authority");
        }
        String normalizedBase = "https://" + authority + path;

        PackTrustAnchor anchor = parseAnchor(anchorHex);
        Map<String, VoiceSource> parsedVoices = parseVoices(allowedVoiceIds);

        return new PackSourceConfig(
                normalizedBase, authority.toLowerCase(Locale.ROOT), path, anchor, parsedVoices);
    }

    /** Raw public key used to authenticate pack manifests. */
    public PackTrustAnchor trustAnchor() {
        return trustAnchor;
    }

    /** Normalised base URL; only used for diagnostics and URL derivation. */
    public String baseUrl() {
        return baseUrl;
    }

    public Collection<VoiceSource> voices() {
        return voices.values();
    }

    public boolean allows(String voiceId) {
        return voiceId != null && voices.containsKey(voiceId);
    }

    /**
     * Returns the allowed voice source.
     *
     * @throws IllegalArgumentException when the voice is not explicitly allowed
     *         by this build's configuration.
     */
    public VoiceSource requireVoice(String voiceId) {
        VoiceSource source = voiceId == null ? null : voices.get(voiceId);
        if (source == null) {
            throw new IllegalArgumentException("voice is not allowed by the pack source");
        }
        return source;
    }

    /**
     * Signed manifest URL for an allowed voice. No caller-supplied URL is ever
     * accepted anywhere in the pack pipeline.
     */
    public String manifestUrl(String voiceId) {
        return urlFor(requireVoice(voiceId), MANIFEST_PATH);
    }

    public String signatureUrl(String voiceId) {
        return urlFor(requireVoice(voiceId), SIGNATURE_PATH);
    }

    /**
     * Payload URL for an allowed voice. The manifest itself constrains the file
     * name to {@code <voiceId>.bin}; the URL is still derived from configuration,
     * not from the manifest.
     */
    public String payloadUrl(String voiceId) {
        VoiceSource source = requireVoice(voiceId);
        return urlFor(source, source.voiceId() + ".bin");
    }

    private String urlFor(VoiceSource source, String fileName) {
        String candidate = baseUrl + "/" + source.packId() + "/" + fileName;
        final URI uri;
        try {
            uri = new URI(candidate);
        } catch (URISyntaxException e) {
            throw new IllegalStateException("derived pack URL is malformed");
        }
        String allowedPrefix = basePath + "/" + source.packId() + "/";
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getRawAuthority() == null
                || !baseAuthority.equals(uri.getRawAuthority().toLowerCase(Locale.ROOT))
                || uri.getRawQuery() != null
                || uri.getRawFragment() != null
                || uri.getRawPath() == null
                || !uri.getRawPath().startsWith(allowedPrefix)
                || !isSafeRelativeSegment(fileName)
                || !isSafeRelativeSegment(source.packId())) {
            throw new IllegalStateException("derived pack URL escaped its configured base");
        }
        return candidate;
    }

    private static PackTrustAnchor parseAnchor(String anchorHex) throws ConfigurationException {
        String value = anchorHex.trim();
        if (value.length() != MAX_ANCHOR_HEX || !value.matches("[0-9a-fA-F]{64}")) {
            throw new ConfigurationException("invalid-pack-anchor",
                    "pack trust anchor must be a 64-character hex Ed25519 public key");
        }
        byte[] raw = new byte[32];
        for (int i = 0; i < raw.length; i++) {
            int high = Character.digit(value.charAt(i * 2), 16);
            int low = Character.digit(value.charAt(i * 2 + 1), 16);
            raw[i] = (byte) ((high << 4) | low);
        }
        try {
            return new PackTrustAnchor(raw);
        } catch (IllegalArgumentException e) {
            throw new ConfigurationException("invalid-pack-anchor",
                    "pack trust anchor is not a usable Ed25519 public key");
        }
    }

    private static Map<String, VoiceSource> parseVoices(String allowedVoiceIds)
            throws ConfigurationException {
        Map<String, VoiceSource> parsed = new LinkedHashMap<>();
        for (String raw : allowedVoiceIds.split(",")) {
            String voiceId = raw.trim();
            if (voiceId.isEmpty()) {
                continue;
            }
            if (!voiceId.matches("[a-z][a-z0-9_]{1,31}")) {
                throw new ConfigurationException("invalid-pack-voice",
                        "allowed voice ids must be lower-case optional voice names");
            }
            String packId = PackManifest.packForVoice(voiceId);
            if (packId == null) {
                throw new ConfigurationException("invalid-pack-voice",
                        "voice " + voiceId + " is not an optional narration voice");
            }
            if (parsed.containsKey(voiceId)) {
                throw new ConfigurationException("invalid-pack-voice",
                        "voice " + voiceId + " is listed more than once");
            }
            parsed.put(voiceId, new VoiceSource(
                    voiceId, packId, languageFor(packId), KNOWN_PAYLOAD_BYTES));
        }
        if (parsed.isEmpty()) {
            throw new ConfigurationException(UNCONFIGURED,
                    "narration pack source allows no optional voices");
        }
        return parsed;
    }

    private static String languageFor(String packId) {
        return packId;
    }

    private static boolean isSafeBasePath(String path) {
        if (path.isEmpty()) {
            return true;
        }
        if (path.contains("\\") || path.contains("//") || path.contains("%")) {
            return false;
        }
        for (String segment : path.substring(1).split("/", -1)) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) {
                return false;
            }
        }
        return true;
    }

    private static boolean isSafeRelativeSegment(String value) {
        return value != null && value.matches("[A-Za-z0-9._-]+")
                && !".".equals(value) && !"..".equals(value);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
