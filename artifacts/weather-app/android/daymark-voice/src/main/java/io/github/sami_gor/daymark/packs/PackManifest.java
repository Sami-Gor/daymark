package io.github.sami_gor.daymark.packs;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Immutable, strictly validated description of one optional narration pack.
 *
 * <p>The manifest is the signed root of trust for a pack. It names the pack and
 * voice, the exact payload file (size and SHA-256), the minimum app version and
 * the licence/attribution metadata. Parsing rejects unknown fields, duplicate
 * fields, non-canonical paths and licences that do not meet
 * {@link PackLicences}.
 *
 * <p>A SHA-256 checksum in the manifest protects integrity only. It says
 * nothing about who produced the manifest: an attacker who controls delivery
 * could replace both the manifest and the payload. Authenticity therefore
 * requires a detached Ed25519 signature over {@link #canonicalBytes()}, checked
 * by {@link PackSignatureVerifier} against a trust anchor pinned by the app.
 *
 * <p>Canonical form is a deterministic UTF-8 JSON serialisation with a fixed
 * field order and no insignificant whitespace. A signer must sign exactly
 * {@link #canonicalBytes()}, not an arbitrary pretty-printed rendering.
 */
public final class PackManifest {

    public static final long SUPPORTED_SCHEMA_VERSION = 1L;

    private static final Set<String> ROOT_FIELDS = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList(
                    "schemaVersion", "packId", "version", "voiceId", "minAppVersion",
                    "licence", "files")));
    private static final Set<String> LICENCE_FIELDS = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList(
                    "spdx", "name", "url", "attribution", "notice", "rights",
                    "developmentOnly")));
    private static final Set<String> FILE_FIELDS = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList("path", "size", "sha256")));

    private final long schemaVersion;
    private final String packId;
    private final long version;
    private final String voiceId;
    private final long minAppVersion;
    private final Licence licence;
    private final List<FileEntry> files;
    private final byte[] canonicalBytes;

    private PackManifest(
            long schemaVersion,
            String packId,
            long version,
            String voiceId,
            long minAppVersion,
            Licence licence,
            List<FileEntry> files) {
        this.schemaVersion = schemaVersion;
        this.packId = packId;
        this.version = version;
        this.voiceId = voiceId;
        this.minAppVersion = minAppVersion;
        this.licence = licence;
        this.files = Collections.unmodifiableList(new ArrayList<>(files));
        this.canonicalBytes = canonicalJson().getBytes(StandardCharsets.UTF_8);
    }

    /** Thrown for any manifest problem; {@link #reason} is stable for UI mapping. */
    public static final class ManifestException extends Exception {
        public final String reason;

        ManifestException(String reason, String message) {
            super(message);
            this.reason = reason;
        }
    }

    /** One payload file described by the manifest. */
    public static final class FileEntry {
        private final String path;
        private final long size;
        private final String sha256;

        FileEntry(String path, long size, String sha256) {
            this.path = path;
            this.size = size;
            this.sha256 = sha256;
        }

        public String path() {
            return path;
        }

        public long size() {
            return size;
        }

        /** Lower-case, 64-character SHA-256 digest. */
        public String sha256() {
            return sha256;
        }
    }

    /** Licence and attribution metadata carried inside the signed manifest. */
    public static final class Licence {
        private final String spdx;
        private final String name;
        private final String url;
        private final String attribution;
        private final String notice;
        private final String rights;
        private final boolean developmentOnly;

        Licence(
                String spdx,
                String name,
                String url,
                String attribution,
                String notice,
                String rights,
                boolean developmentOnly) {
            this.spdx = spdx;
            this.name = name;
            this.url = url;
            this.attribution = attribution;
            this.notice = notice;
            this.rights = rights;
            this.developmentOnly = developmentOnly;
        }

        public String spdx() {
            return spdx;
        }

        public String name() {
            return name;
        }

        public String url() {
            return url;
        }

        public String attribution() {
            return attribution;
        }

        public String notice() {
            return notice;
        }

        /** {@link PackLicences#RIGHTS_CLEARED} or {@link PackLicences#RIGHTS_UNRESOLVED}. */
        public String rights() {
            return rights;
        }

        public boolean developmentOnly() {
            return developmentOnly;
        }

        /**
         * True only when rights are explicitly cleared and the pack is not
         * development-only. A missing rights field never reaches this method:
         * parsing rejects it.
         */
        public boolean isDistributable() {
            return PackLicences.RIGHTS_CLEARED.equals(rights) && !developmentOnly;
        }
    }

    public static PackManifest parse(byte[] utf8) throws ManifestException {
        Object root;
        try {
            root = Json.parse(utf8, Json.MAX_MANIFEST_BYTES);
        } catch (Json.ParseException e) {
            throw new ManifestException(e.reason, e.getMessage());
        }
        Map<String, Object> object = requireObject(root, "manifest");
        requireOnlyKeys(object, ROOT_FIELDS);

        long schemaVersion = requireLong(object, "schemaVersion");
        if (schemaVersion != SUPPORTED_SCHEMA_VERSION) {
            throw new ManifestException("invalid-schema",
                    "unsupported manifest schema " + schemaVersion);
        }
        String packId = requireToken(object, "packId");
        if (!packId.matches("[a-z]{2}") || "en".equals(packId)) {
            throw new ManifestException("invalid-pack",
                    "pack id must be an optional two-letter language code");
        }
        String expectedVoice = voiceForPack(packId);
        if (expectedVoice == null) {
            throw new ManifestException("unsupported-pack",
                    "no optional narration voice is defined for pack " + packId);
        }

        long version = requireLong(object, "version");
        if (version <= 0) {
            throw new ManifestException("invalid-version", "pack version must be positive");
        }
        String voiceId = requireToken(object, "voiceId");
        if (!expectedVoice.equals(voiceId)) {
            throw new ManifestException("voice-pack-mismatch",
                    "pack " + packId + " must name voice " + expectedVoice);
        }
        long minAppVersion = requireLong(object, "minAppVersion");
        if (minAppVersion <= 0) {
            throw new ManifestException("invalid-version",
                    "minAppVersion must be positive");
        }

        if (!object.containsKey("licence")) {
            throw new ManifestException("missing-field", "missing field 'licence'");
        }
        if (!object.containsKey("files")) {
            throw new ManifestException("missing-field", "missing field 'files'");
        }
        Licence licence = parseLicence(requireObject(object.get("licence"), "licence"), voiceId);
        List<FileEntry> files = parseFiles(object.get("files"), voiceId);
        return new PackManifest(
                schemaVersion, packId, version, voiceId, minAppVersion, licence, files);
    }

    public static PackManifest parse(String json) throws ManifestException {
        return parse(json.getBytes(StandardCharsets.UTF_8));
    }

    /** Optional pack id for a supported narration voice, or null. */
    public static String packForVoice(String voiceId) {
        if (PackLicences.FRENCH_VOICE.equals(voiceId)) {
            return "fr";
        }
        if (PackLicences.SPANISH_VOICE.equals(voiceId)) {
            return "es";
        }
        return null;
    }

    /** Supported narration voice for an optional pack id, or null. */
    public static String voiceForPack(String packId) {
        if ("fr".equals(packId)) {
            return PackLicences.FRENCH_VOICE;
        }
        if ("es".equals(packId)) {
            return PackLicences.SPANISH_VOICE;
        }
        return null;
    }

    private static Licence parseLicence(Map<String, Object> object, String voiceId)
            throws ManifestException {
        requireOnlyKeys(object, LICENCE_FIELDS);
        String spdx = requireToken(object, "spdx");
        String name = requireToken(object, "name");
        String url = requireToken(object, "url");
        String attribution = requireText(object, "attribution");
        String notice = requireText(object, "notice");
        String rights = optionalToken(object, "rights");
        if (rights == null) {
            throw new ManifestException("missing-rights",
                    "licence rights status is required; an absent flag is never distributable");
        }
        if (!PackLicences.RIGHTS_CLEARED.equals(rights)
                && !PackLicences.RIGHTS_UNRESOLVED.equals(rights)) {
            throw new ManifestException("invalid-rights",
                    "licence rights must be '" + PackLicences.RIGHTS_CLEARED + "' or '"
                            + PackLicences.RIGHTS_UNRESOLVED + "'");
        }
        boolean developmentOnly = requireBoolean(object, "developmentOnly");
        if (PackLicences.RIGHTS_UNRESOLVED.equals(rights) && !developmentOnly) {
            throw new ManifestException("development-only-required",
                    "a pack with unresolved rights must be marked developmentOnly");
        }
        if (!url.startsWith("https://")) {
            throw new ManifestException("invalid-licence",
                    "licence URL must use HTTPS");
        }
        String violation = PackLicences.violation(
                voiceId, spdx, name, url, attribution, notice);
        if (violation != null) {
            throw new ManifestException("invalid-licence", violation);
        }
        return new Licence(spdx, name, url, attribution, notice, rights, developmentOnly);
    }

    private static List<FileEntry> parseFiles(Object value, String voiceId)
            throws ManifestException {
        if (!(value instanceof List)) {
            throw new ManifestException("invalid-file", "files must be an array");
        }
        List<?> array = (List<?>) value;
        if (array.size() != 1) {
            throw new ManifestException("invalid-file",
                    "V2.1 narration packs must contain exactly one voice payload file");
        }
        Map<String, Object> object = requireObject(array.get(0), "file");
        requireOnlyKeys(object, FILE_FIELDS);
        String path = requireToken(object, "path");
        if (!isSafeRelativePath(path)) {
            throw new ManifestException("invalid-file-path",
                    "pack file path must be a relative path without traversal");
        }
        if (!(voiceId + ".bin").equals(path)) {
            throw new ManifestException("invalid-file-path",
                    "voice payload must be named " + voiceId + ".bin");
        }
        long size = requireLong(object, "size");
        if (size <= 0) {
            throw new ManifestException("invalid-size", "pack payload size must be positive");
        }
        String sha256 = requireToken(object, "sha256");
        if (!sha256.matches("[0-9a-fA-F]{64}")) {
            throw new ManifestException("invalid-hash",
                    "payload SHA-256 must be a 64-character hex digest");
        }
        return Collections.singletonList(
                new FileEntry(path, size, sha256.toLowerCase(Locale.ROOT)));
    }

    private static boolean isSafeRelativePath(String path) {
        if (path.isEmpty() || path.length() > 255
                || path.startsWith("/") || path.contains("\\") || path.indexOf('\0') >= 0) {
            return false;
        }
        String[] segments = path.split("/", -1);
        for (String segment : segments) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) {
                return false;
            }
        }
        return true;
    }

    private static Map<String, Object> requireObject(Object value, String name)
            throws ManifestException {
        if (!(value instanceof Map)) {
            throw new ManifestException("invalid-field", name + " must be an object");
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> object = (Map<String, Object>) value;
        return object;
    }

    private static void requireOnlyKeys(Map<String, Object> object, Set<String> allowed)
            throws ManifestException {
        for (String key : object.keySet()) {
            if (!allowed.contains(key)) {
                throw new ManifestException("unknown-field", "unknown field '" + key + "'");
            }
        }
    }

    private static String requireText(Map<String, Object> object, String key)
            throws ManifestException {
        Object value = object.get(key);
        if (value == null) {
            throw new ManifestException("missing-field", "missing field '" + key + "'");
        }
        if (!(value instanceof String)) {
            throw new ManifestException("invalid-field", key + " must be a string");
        }
        String text = (String) value;
        if (text.trim().isEmpty()) {
            throw new ManifestException("invalid-field", key + " must not be empty");
        }
        if (text.length() > 8192) {
            throw new ManifestException("invalid-field", key + " is unreasonably long");
        }
        return text;
    }

    /** A text field that must not have leading or trailing whitespace. */
    private static String requireToken(Map<String, Object> object, String key)
            throws ManifestException {
        String text = requireText(object, key);
        if (!text.equals(text.trim())) {
            throw new ManifestException("invalid-field",
                    key + " must not have leading or trailing whitespace");
        }
        return text;
    }

    private static String optionalToken(Map<String, Object> object, String key)
            throws ManifestException {
        Object value = object.get(key);
        if (value == null) {
            return null;
        }
        if (!(value instanceof String)) {
            throw new ManifestException("invalid-field", key + " must be a string");
        }
        String text = (String) value;
        return text.trim().isEmpty() ? null : requireToken(object, key);
    }

    private static long requireLong(Map<String, Object> object, String key)
            throws ManifestException {
        Object value = object.get(key);
        if (value == null) {
            throw new ManifestException("missing-field", "missing field '" + key + "'");
        }
        if (!(value instanceof Long)) {
            throw new ManifestException("invalid-field", key + " must be an integer");
        }
        return (Long) value;
    }

    private static boolean requireBoolean(Map<String, Object> object, String key)
            throws ManifestException {
        Object value = object.get(key);
        if (value == null) {
            throw new ManifestException("missing-field", "missing field '" + key + "'");
        }
        if (!(value instanceof Boolean)) {
            throw new ManifestException("invalid-field", key + " must be a boolean");
        }
        return (Boolean) value;
    }

    public long schemaVersion() {
        return schemaVersion;
    }

    public String packId() {
        return packId;
    }

    public long version() {
        return version;
    }

    public String voiceId() {
        return voiceId;
    }

    public long minAppVersion() {
        return minAppVersion;
    }

    public Licence licence() {
        return licence;
    }

    public List<FileEntry> files() {
        return files;
    }

    /** The single voice payload described by this manifest. */
    public FileEntry file() {
        return files.get(0);
    }

    /** Total payload bytes, used by the storage preflight. */
    public long totalBytes() {
        long total = 0L;
        for (FileEntry file : files) {
            total += file.size();
        }
        return total;
    }

    /**
     * Deterministic signed representation. Callers must not mutate or
     * reinterpret the returned array; a defensive copy is returned.
     */
    public byte[] canonicalBytes() {
        return canonicalBytes.clone();
    }

    private String canonicalJson() {
        StringBuilder out = new StringBuilder(512);
        out.append('{');
        field(out, "schemaVersion", schemaVersion);
        out.append(',');
        field(out, "packId", packId);
        out.append(',');
        field(out, "version", version);
        out.append(',');
        field(out, "voiceId", voiceId);
        out.append(',');
        field(out, "minAppVersion", minAppVersion);
        out.append(',');
        out.append(Json.quote("licence")).append(":{");
        field(out, "spdx", licence.spdx());
        out.append(',');
        field(out, "name", licence.name());
        out.append(',');
        field(out, "url", licence.url());
        out.append(',');
        field(out, "attribution", licence.attribution());
        out.append(',');
        field(out, "notice", licence.notice());
        out.append(',');
        field(out, "rights", licence.rights());
        out.append(',');
        field(out, "developmentOnly", licence.developmentOnly());
        out.append("},");
        out.append(Json.quote("files")).append(":[{");
        FileEntry file = file();
        field(out, "path", file.path());
        out.append(',');
        field(out, "size", file.size());
        out.append(',');
        field(out, "sha256", file.sha256());
        out.append("}]}");
        return out.toString();
    }

    private static void field(StringBuilder out, String name, long value) {
        out.append(Json.quote(name)).append(':').append(value);
    }

    private static void field(StringBuilder out, String name, boolean value) {
        out.append(Json.quote(name)).append(':').append(value);
    }

    private static void field(StringBuilder out, String name, String value) {
        out.append(Json.quote(name)).append(':').append(Json.quote(value));
    }
}
