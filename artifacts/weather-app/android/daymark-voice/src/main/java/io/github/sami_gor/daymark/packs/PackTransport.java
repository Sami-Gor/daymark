package io.github.sami_gor.daymark.packs;

import java.io.File;

/**
 * Transport boundary for pack payloads and manifests.
 *
 * <p>Implementations must fetch over HTTPS only, must not attach credentials,
 * and must support resuming an interrupted payload with an HTTP {@code Range}
 * request. Tests use a local mock implementation; production uses
 * {@link HttpUrlConnectionTransport}.
 *
 * <p>The transport is not trusted to verify size or SHA-256. It only moves
 * bytes; {@link PackInstaller} re-hashes the staged file and
 * {@link PackSignatureVerifier} authenticates the manifest.
 */
public interface PackTransport {

    /** Progress for a payload download. {@code totalBytes} may be -1 if unknown. */
    interface Progress {
        void onProgress(long downloadedBytes, long totalBytes);
    }

    /** Cooperative cancellation checked between network reads. */
    interface CancelSignal {
        boolean isCancelled();
    }

    /** Result of one download call (which may have resumed a partial file). */
    final class DownloadResult {
        public final long totalBytes;
        public final long bytesReceived;
        public final long remoteTotalBytes;
        public final boolean resumed;
        public final int statusCode;

        public DownloadResult(
                long totalBytes,
                long bytesReceived,
                long remoteTotalBytes,
                boolean resumed,
                int statusCode) {
            this.totalBytes = totalBytes;
            this.bytesReceived = bytesReceived;
            this.remoteTotalBytes = remoteTotalBytes;
            this.resumed = resumed;
            this.statusCode = statusCode;
        }
    }

    /** Thrown for transport failures; {@link #reason} is stable for UI mapping. */
    final class TransportException extends Exception {
        public final String reason;

        public TransportException(String reason, String message) {
            super(message);
            this.reason = reason;
        }

        public TransportException(String reason, String message, Throwable cause) {
            super(message, cause);
            this.reason = reason;
        }
    }

    /**
     * Downloads {@code url} into {@code destination}. When {@code resume} is
     * true and the destination already contains bytes, the implementation
     * requests the remaining range and appends. A server that ignores the range
     * (HTTP 200) causes the destination to be restarted from zero, which is
     * reported as {@code resumed == false}.
     *
     * <p>On cancellation the implementation throws
     * {@link TransportException} with reason {@code cancelled} and leaves the
     * bytes already received in place so a later call can resume.
     */
    DownloadResult download(
            String url,
            File destination,
            boolean resume,
            long expectedTotalBytes,
            Progress progress,
            CancelSignal cancel) throws TransportException;

    /**
     * Fetches a small metadata document (the manifest or detached signature)
     * with a hard upper bound. Used only for {@code *.json} and {@code *.sig};
     * payload bytes go through {@link #download}.
     */
    byte[] fetch(String url, int maxBytes) throws TransportException;
}
