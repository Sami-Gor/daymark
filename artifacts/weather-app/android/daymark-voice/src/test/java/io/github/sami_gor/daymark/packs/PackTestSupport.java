package io.github.sami_gor.daymark.packs;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.util.HashMap;
import java.util.Map;

import io.github.sami_gor.daymark.packs.PackTransport.CancelSignal;
import io.github.sami_gor.daymark.packs.PackTransport.DownloadResult;
import io.github.sami_gor.daymark.packs.PackTransport.Progress;
import io.github.sami_gor.daymark.packs.PackTransport.TransportException;

/** Shared fixtures for the pack-manager JVM tests. */
final class PackTestSupport {

    private PackTestSupport() {
    }

    static String sha256(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            StringBuilder hex = new StringBuilder(64);
            for (byte b : digest.digest(bytes)) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    static File write(File file, byte[] bytes) throws IOException {
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return file;
    }

    static String frenchManifestJson(long version, byte[] payload, long minAppVersion) {
        return manifestJson("fr", version, "ff_siwis", minAppVersion,
                frenchLicence(), filesJson("ff_siwis.bin", payload));
    }

    static String spanishManifestJson(long version, byte[] payload, long minAppVersion) {
        return manifestJson("es", version, "em_alex", minAppVersion,
                spanishLicence(), filesJson("em_alex.bin", payload));
    }

    static String manifestJson(
            String packId,
            long version,
            String voiceId,
            long minAppVersion,
            String licenceJson,
            String filesJson) {
        return "{\"schemaVersion\":1"
                + ",\"packId\":" + Json.quote(packId)
                + ",\"version\":" + version
                + ",\"voiceId\":" + Json.quote(voiceId)
                + ",\"minAppVersion\":" + minAppVersion
                + ",\"licence\":" + licenceJson
                + ",\"files\":" + filesJson
                + "}";
    }

    static String filesJson(String path, byte[] payload) {
        return "[{\"path\":" + Json.quote(path)
                + ",\"size\":" + payload.length
                + ",\"sha256\":" + Json.quote(sha256(payload))
                + "}]";
    }

    static String frenchLicence() {
        return licence(
                PackLicences.FRENCH_LICENCE_SPDX,
                PackLicences.FRENCH_LICENCE_NAME,
                PackLicences.FRENCH_LICENCE_URL,
                PackLicences.FRENCH_ATTRIBUTION,
                PackLicences.FRENCH_NOTICE,
                PackLicences.RIGHTS_CLEARED,
                false);
    }

    static String spanishLicence() {
        return licence(
                PackLicences.SPANISH_LICENCE_SPDX,
                PackLicences.SPANISH_LICENCE_NAME,
                PackLicences.SPANISH_LICENCE_URL,
                PackLicences.SPANISH_ATTRIBUTION,
                PackLicences.SPANISH_NOTICE,
                PackLicences.RIGHTS_UNRESOLVED,
                true);
    }

    static String licence(
            String spdx,
            String name,
            String url,
            String attribution,
            String notice,
            String rights,
            boolean developmentOnly) {
        String rightsField = rights == null ? "" : ",\"rights\":" + Json.quote(rights);
        return "{\"spdx\":" + Json.quote(spdx)
                + ",\"name\":" + Json.quote(name)
                + ",\"url\":" + Json.quote(url)
                + ",\"attribution\":" + Json.quote(attribution)
                + ",\"notice\":" + Json.quote(notice)
                + rightsField
                + ",\"developmentOnly\":" + developmentOnly
                + "}";
    }

    static PackManifest parseFrench(long version, byte[] payload) throws Exception {
        return PackManifest.parse(frenchManifestJson(version, payload, 21000));
    }

    static KeyPair ed25519KeyPair() throws Exception {
        return KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
    }

    static byte[] sign(PrivateKey privateKey, byte[] message) throws Exception {
        Signature signature = Signature.getInstance("Ed25519");
        signature.initSign(privateKey);
        signature.update(message);
        return signature.sign();
    }

    static PackTrustAnchor anchor(PublicKey publicKey) {
        return PackTrustAnchor.fromX509(publicKey.getEncoded());
    }

    /** Deterministic in-memory transport with resumable byte delivery. */
    static final class MockTransport implements PackTransport {
        byte[] payload;
        final Map<String, byte[]> metadata = new HashMap<>();
        int downloadCalls;
        int fetchCalls;
        boolean lastResume;
        boolean lastRestarted;
        int bytesWrittenPerCall = -1;
        int failAfterBytes = -1;
        int cancelAfterBytes = -1;
        String failureReason = "io";
        Progress lastProgress;

        MockTransport(byte[] payload) {
            this.payload = payload;
        }

        @Override
        public DownloadResult download(
                String url,
                File destination,
                boolean resume,
                long expectedTotalBytes,
                Progress progress,
                CancelSignal cancel) throws TransportException {
            downloadCalls++;
            lastProgress = progress;
            long start = resume && destination.isFile() ? destination.length() : 0L;
            lastResume = start > 0;
            if (start > payload.length) {
                start = 0;
                lastRestarted = true;
            }
            int limit = payload.length - (int) start;
            if (bytesWrittenPerCall >= 0) {
                limit = Math.min(limit, bytesWrittenPerCall);
            }
            int written = 0;
            try (FileOutputStream out = new FileOutputStream(destination, start > 0)) {
                for (int i = 0; i < limit; i++) {
                    if (cancelAfterBytes >= 0 && written >= cancelAfterBytes
                            && cancel != null && cancel.isCancelled()) {
                        throw new TransportException("cancelled", "cancelled by test");
                    }
                    out.write(payload[(int) start + i]);
                    written++;
                    if (progress != null) {
                        progress.onProgress(start + written, expectedTotalBytes);
                    }
                    if (failAfterBytes >= 0 && written >= failAfterBytes) {
                        throw new TransportException(failureReason, "injected failure");
                    }
                }
            } catch (IOException e) {
                throw new TransportException("io", e.getMessage(), e);
            }
            return new DownloadResult(
                    destination.length(),
                    written,
                    payload.length,
                    start > 0,
                    start > 0 ? 206 : 200);
        }

        @Override
        public byte[] fetch(String url, int maxBytes) throws TransportException {
            fetchCalls++;
            byte[] value = metadata.get(url);
            if (value == null) {
                throw new TransportException("http-404", "no fixture for " + url);
            }
            if (value.length > maxBytes) {
                throw new TransportException("too-large", "fixture too large");
            }
            return value;
        }
    }

    static final class FixedFreeSpace implements PackDownloader.FreeSpace {
        long available;

        FixedFreeSpace(long available) {
            this.available = available;
        }

        @Override
        public long usableBytes(File directory) {
            return available;
        }
    }

    static byte[] utf8(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    static byte[] concat(byte[] first, byte[] second) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(first, 0, first.length);
        out.write(second, 0, second.length);
        return out.toByteArray();
    }
}
