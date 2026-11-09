package io.github.sami_gor.daymark.packs;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

/**
 * Downloads, verifies and activates optional narration packs.
 *
 * <p>Flow (see {@code docs/architecture/tts-pack-manager.md}):
 * <ol>
 *   <li>Fetch the manifest and its detached signature (or accept an already
 *       parsed manifest) and verify the Ed25519 signature against the pinned
 *       {@link PackTrustAnchor}.</li>
 *   <li>Check {@code minAppVersion}, the licence rights flag and free space
 *       before any payload bytes are requested.</li>
 *   <li>Download into {@code <root>/staging/<id>-<version>.part}, resuming an
 *       existing partial file with HTTP Range, reporting progress and honouring
 *       cancellation.</li>
 *   <li>Hand the part to {@link PackInstaller#installStaged} for size and
 *       SHA-256 verification and atomic move into the version directory.</li>
 *   <li>Publish the verified payload atomically as
 *       {@code filesDir/kokoro/<voiceId>.bin}, then atomically activate the
 *       version pointer. If activation fails, the previous voice file and the
 *       previous current pointer remain in effect.</li>
 * </ol>
 *
 * <p>After a successful installation the caller must invoke Agent B's
 * {@code registerVoice({ voiceId })}. Removing a pack deletes the pack payload
 * and current pointer through {@link PackInstaller#remove}, then the voice file;
 * the caller must invoke {@code getInstalledVoices()}. A removed voice cannot be
 * selected because {@code NarrationVoicePolicy} requires the voice file to be
 * present.
 */
public final class PackDownloader {

    /** Supplies free bytes for the pack root; injectable for deterministic tests. */
    public interface FreeSpace {
        long usableBytes(File directory);

        static FreeSpace fileSystem() {
            return File::getUsableSpace;
        }
    }

    /** Coarse install stage, reported before the work for that stage starts. */
    public enum Stage {
        VERIFYING,
        DOWNLOADING,
        INSTALLING,
        ACTIVATING
    }

    /**
     * Optional observer for callers that surface install phases to a UI. The
     * callbacks run on the caller's thread and never replace the authoritative
     * size/hash checks in {@link PackInstaller}.
     */
    public interface StageObserver {
        void onStage(Stage stage);
    }

    /** A verified manifest together with the detached signature that proved it. */
    public static final class FetchedManifest {
        public final PackManifest manifest;
        private final byte[] signature;

        FetchedManifest(PackManifest manifest, byte[] signature) {
            this.manifest = manifest;
            this.signature = signature == null ? null : signature.clone();
        }

        /** Detached 64-byte Ed25519 signature over {@link PackManifest#canonicalBytes()}. */
        public byte[] signature() {
            return signature == null ? null : signature.clone();
        }
    }

    /** Result of a successful install or update. */
    public static final class Result {
        public final String packId;
        public final long version;
        public final long previousVersion;
        public final String voiceId;
        public final File payload;
        public final File voiceFile;

        Result(
                String packId,
                long version,
                long previousVersion,
                String voiceId,
                File payload,
                File voiceFile) {
            this.packId = packId;
            this.version = version;
            this.previousVersion = previousVersion;
            this.voiceId = voiceId;
            this.payload = payload;
            this.voiceFile = voiceFile;
        }

        public boolean updated() {
            return previousVersion > 0;
        }
    }

    /** Result of a removal. */
    public static final class Removed {
        public final String packId;
        public final String voiceId;
        public final boolean voiceDeleted;

        Removed(String packId, String voiceId, boolean voiceDeleted) {
            this.packId = packId;
            this.voiceId = voiceId;
            this.voiceDeleted = voiceDeleted;
        }
    }

    private final PackInstaller installer;
    private final File voicesDir;
    private final PackTransport transport;
    private final PackSignatureVerifier verifier;
    private final long appVersionCode;
    private final boolean allowDevelopmentOnlyPacks;
    private final FreeSpace freeSpace;

    public PackDownloader(
            PackInstaller installer,
            File voicesDir,
            PackTransport transport,
            PackSignatureVerifier verifier,
            long appVersionCode,
            boolean allowDevelopmentOnlyPacks,
            FreeSpace freeSpace) {
        if (installer == null || voicesDir == null || transport == null || verifier == null) {
            throw new IllegalArgumentException("installer, voicesDir, transport and verifier are required");
        }
        if (freeSpace == null) {
            throw new IllegalArgumentException("free-space provider is required");
        }
        this.installer = installer;
        this.voicesDir = voicesDir;
        this.transport = transport;
        this.verifier = verifier;
        this.appVersionCode = appVersionCode;
        this.allowDevelopmentOnlyPacks = allowDevelopmentOnlyPacks;
        this.freeSpace = freeSpace;
    }

    /** Fetches, parses and authenticates a manifest and its detached signature. */
    public PackManifest fetchManifest(String manifestUrl, String signatureUrl)
            throws PackInstaller.PackException {
        return fetchVerifiedManifest(manifestUrl, signatureUrl).manifest;
    }

    /**
     * Fetches, parses and authenticates a manifest, returning the detached
     * signature as well so the caller can pass it to {@link #install} without a
     * second network fetch.
     */
    public FetchedManifest fetchVerifiedManifest(String manifestUrl, String signatureUrl)
            throws PackInstaller.PackException {
        byte[] manifestBytes;
        byte[] signature;
        try {
            manifestBytes = transport.fetch(manifestUrl, Json.MAX_MANIFEST_BYTES);
            signature = transport.fetch(signatureUrl, PackSignatureVerifier.SIGNATURE_BYTES);
        } catch (PackTransport.TransportException e) {
            throw new PackInstaller.PackException(e.reason, e.getMessage());
        }
        return parseAndVerify(manifestBytes, signature);
    }

    /**
     * Installs (or updates to) a signed manifest.
     *
     * @param signature detached 64-byte Ed25519 signature over
     *                  {@link PackManifest#canonicalBytes()}.
     * @throws PackInstaller.PackException with a stable reason such as
     *         {@code malformed-signature}, {@code signature-mismatch},
     *         {@code app-too-old}, {@code not-distributable},
     *         {@code insufficient-storage}, {@code cancelled},
     *         {@code size-mismatch}, {@code hash-mismatch} or {@code io}.
     */
    public Result install(
            PackManifest manifest,
            String payloadUrl,
            byte[] signature,
            PackTransport.Progress progress,
            PackTransport.CancelSignal cancel) throws PackInstaller.PackException {
        return install(manifest, payloadUrl, signature, progress, cancel, null);
    }

    /**
     * Installs (or updates to) a signed manifest, reporting coarse stages to
     * {@code observer}. The observer is advisory: it cannot skip verification
     * or change the expected size/digest.
     */
    public Result install(
            PackManifest manifest,
            String payloadUrl,
            byte[] signature,
            PackTransport.Progress progress,
            PackTransport.CancelSignal cancel,
            StageObserver observer) throws PackInstaller.PackException {
        if (manifest == null) {
            throw new PackInstaller.PackException("invalid-manifest", "manifest is missing");
        }
        notifyStage(observer, Stage.VERIFYING);
        try {
            verifier.verify(manifest, signature);
        } catch (PackSignatureVerifier.SignatureException e) {
            throw new PackInstaller.PackException(e.reason, e.getMessage());
        }
        if (manifest.minAppVersion() > appVersionCode) {
            throw new PackInstaller.PackException("app-too-old",
                    "pack requires app version " + manifest.minAppVersion()
                            + " but this app is " + appVersionCode);
        }
        if (!manifest.licence().isDistributable() && !allowDevelopmentOnlyPacks) {
            throw new PackInstaller.PackException("not-distributable",
                    "pack is not cleared for distribution (rights="
                            + manifest.licence().rights()
                            + ", developmentOnly=" + manifest.licence().developmentOnly() + ")");
        }
        if (payloadUrl == null || payloadUrl.trim().isEmpty()) {
            throw new PackInstaller.PackException("invalid-url", "payload URL is missing");
        }

        String packId = manifest.packId();
        long version = manifest.version();
        PackManifest.FileEntry payloadEntry = manifest.file();
        long expectedSize = payloadEntry.size();
        String expectedSha256 = payloadEntry.sha256();

        File part = installer.stagingPart(packId, version);
        if (part.exists() && !part.isFile()) {
            part.delete();
        }
        if (part.isFile() && part.length() > expectedSize) {
            part.delete();
        }
        long alreadyDownloaded = part.isFile() ? part.length() : 0L;
        long required = PackStoragePreflight.requiredBytes(expectedSize, alreadyDownloaded);
        long available = freeSpace.usableBytes(installer.root());
        if (available < required) {
            throw new PackInstaller.PackException("insufficient-storage",
                    "need " + required + " bytes, only " + available + " available");
        }

        if (alreadyDownloaded < expectedSize) {
            notifyStage(observer, Stage.DOWNLOADING);
            try {
                transport.download(payloadUrl, part, true, expectedSize, progress, cancel);
            } catch (PackTransport.TransportException e) {
                throw new PackInstaller.PackException(e.reason, e.getMessage());
            }
        }
        if (cancel != null && cancel.isCancelled()) {
            throw new PackInstaller.PackException("cancelled", "pack download was cancelled");
        }
        long downloaded = part.isFile() ? part.length() : 0L;
        if (downloaded != expectedSize) {
            if (downloaded > expectedSize) {
                part.delete();
            }
            throw new PackInstaller.PackException("size-mismatch",
                    "downloaded " + downloaded + " bytes, expected " + expectedSize);
        }

        notifyStage(observer, Stage.INSTALLING);
        PackInstaller.Installed installed =
                installer.installStaged(packId, version, part, expectedSize, expectedSha256);
        long previousVersion = installer.activeVersion(packId);
        File voiceFile = new File(voicesDir, manifest.voiceId() + ".bin");
        File backup = new File(voicesDir, "." + manifest.voiceId() + ".bin.backup");
        boolean replacedVoice = publishVoice(installed.directory, voiceFile, backup, expectedSha256);
        notifyStage(observer, Stage.ACTIVATING);
        try {
            installer.activate(installed);
        } catch (PackInstaller.PackException activationFailure) {
            rollbackVoice(voiceFile, backup, replacedVoice, activationFailure);
            throw activationFailure;
        }
        if (backup.exists()) {
            backup.delete();
        }
        return new Result(packId, version, previousVersion, manifest.voiceId(),
                new File(installed.directory, "payload"), voiceFile);
    }

    public Result install(PackManifest manifest, String payloadUrl, byte[] signature)
            throws PackInstaller.PackException {
        return install(manifest, payloadUrl, signature, null, null);
    }

    /**
     * Removes an optional pack and its voice file. English is built in and is
     * rejected. The caller must subsequently call the runtime's
     * {@code getInstalledVoices()}; a removed voice cannot be selected because
     * {@code NarrationVoicePolicy} requires the file.
     */
    public Removed remove(String packId) throws PackInstaller.PackException {
        if (PackInstaller.BUILTIN_ENGLISH.equals(packId)) {
            throw new PackInstaller.PackException("builtin-pack",
                    "English narration cannot be removed");
        }
        String voiceId = PackManifest.voiceForPack(packId);
        if (voiceId == null) {
            throw new PackInstaller.PackException("unsupported-pack",
                    "no optional narration pack is defined for " + packId);
        }
        installer.remove(packId);
        File voiceFile = new File(voicesDir, voiceId + ".bin");
        boolean deleted = false;
        if (voiceFile.exists()) {
            if (!voiceFile.delete()) {
                throw new PackInstaller.PackException("io", "cannot remove voice file");
            }
            deleted = true;
        }
        deleteIfPresent(new File(voicesDir, "." + voiceId + ".bin.backup"));
        deleteIfPresent(new File(voicesDir, "." + voiceId + ".bin.tmp"));
        return new Removed(packId, voiceId, deleted);
    }

    private FetchedManifest parseAndVerify(byte[] manifestBytes, byte[] signature)
            throws PackInstaller.PackException {
        PackManifest manifest;
        try {
            manifest = PackManifest.parse(manifestBytes);
        } catch (PackManifest.ManifestException e) {
            throw new PackInstaller.PackException("invalid-manifest",
                    e.reason + ": " + e.getMessage());
        }
        try {
            verifier.verify(manifest, signature);
        } catch (PackSignatureVerifier.SignatureException e) {
            throw new PackInstaller.PackException(e.reason, e.getMessage());
        }
        return new FetchedManifest(manifest, signature);
    }

    private static void notifyStage(StageObserver observer, Stage stage) {
        if (observer != null) {
            observer.onStage(stage);
        }
    }

    /**
     * Copies the verified payload into the engine's voice directory atomically.
     *
     * @return true when an existing voice file was backed up and replaced, so
     *         rollback can restore it.
     */
    private boolean publishVoice(
            File versionDirectory, File voiceFile, File backup, String expectedSha256)
            throws PackInstaller.PackException {
        File payload = new File(versionDirectory, "payload");
        File parent = voicesDir;
        if (!parent.isDirectory() && !parent.mkdirs()) {
            throw new PackInstaller.PackException("io", "cannot create voice directory");
        }
        File temp = new File(voicesDir, "." + voiceFile.getName() + ".tmp");
        try {
            copy(payload, temp);
            String copiedHash = PackInstaller.sha256(temp);
            if (!expectedSha256.equalsIgnoreCase(copiedHash)) {
                temp.delete();
                throw new PackInstaller.PackException("voice-hash-mismatch",
                        "voice copy does not match the verified payload");
            }
        } catch (IOException e) {
            temp.delete();
            throw new PackInstaller.PackException("io",
                    "cannot publish voice file: " + e.getMessage());
        }
        boolean hadPrevious = voiceFile.isFile();
        if (hadPrevious) {
            try {
                Files.copy(voiceFile.toPath(), backup.toPath(),
                        StandardCopyOption.REPLACE_EXISTING);
                sync(backup);
            } catch (IOException e) {
                temp.delete();
                backup.delete();
                throw new PackInstaller.PackException("io",
                        "cannot back up the previous voice: " + e.getMessage());
            }
        } else {
            backup.delete();
        }
        if (!PackInstaller.moveIntoPlace(temp, voiceFile)) {
            temp.delete();
            if (hadPrevious) {
                backup.delete();
            }
            throw new PackInstaller.PackException("io", "cannot publish voice file atomically");
        }
        return hadPrevious;
    }

    private void rollbackVoice(
            File voiceFile,
            File backup,
            boolean replacedVoice,
            PackInstaller.PackException activationFailure)
            throws PackInstaller.PackException {
        boolean restored;
        if (replacedVoice && backup.isFile()) {
            restored = PackInstaller.moveIntoPlace(backup, voiceFile);
        } else if (!replacedVoice) {
            restored = !voiceFile.exists() || voiceFile.delete();
        } else {
            restored = false;
        }
        if (!restored) {
            PackInstaller.PackException rollback = new PackInstaller.PackException(
                    "voice-rollback-failed",
                    "activation failed and the previous voice could not be restored");
            rollback.addSuppressed(activationFailure);
            throw rollback;
        }
    }

    private static void copy(File source, File target) throws IOException {
        try (InputStream in = new FileInputStream(source);
                OutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            out.flush();
            if (out instanceof FileOutputStream) {
                ((FileOutputStream) out).getFD().sync();
            }
        }
    }

    private static void sync(File file) throws IOException {
        try (FileOutputStream out = new FileOutputStream(file, true)) {
            out.getFD().sync();
        }
    }

    private static boolean deleteIfPresent(File file) {
        return !file.exists() || file.delete();
    }
}
