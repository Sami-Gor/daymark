package io.github.sami_gor.daymark.packs;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.Locale;

/**
 * HTTPS-only {@link PackTransport} built on {@link HttpURLConnection}.
 *
 * <p>Security properties:
 * <ul>
 *   <li>Only {@code https} URLs are accepted; redirects are followed manually
 *       and each hop must also be HTTPS, so a redirect cannot downgrade to
 *       cleartext.</li>
 *   <li>No {@code Authorization}, token or cookie header is ever set, and URLs
 *       containing user-info are rejected. The app must not install an
 *       authenticated global {@link java.net.CookieHandler}; this class does not
 *       consult one itself.</li>
 *   <li>Transparent content encoding is refused ({@code Accept-Encoding:
 *       identity}) so {@code Content-Length} and {@code Range} stay meaningful.</li>
 *   <li>Downloads resume with a {@code Range} request when a partial file is
 *       present; a server that ignores it is detected and the file restarts
 *       from byte zero.</li>
 * </ul>
 */
public final class HttpUrlConnectionTransport implements PackTransport {

    private static final int DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
    private static final int DEFAULT_READ_TIMEOUT_MS = 30_000;
    private static final int MAX_REDIRECTS = 5;
    private static final int MAX_URL_LENGTH = 2048;
    private static final int BUFFER_BYTES = 64 * 1024;
    private static final String USER_AGENT = "DaymarkPackManager/2.1";

    private final int connectTimeoutMs;
    private final int readTimeoutMs;

    public HttpUrlConnectionTransport() {
        this(DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_READ_TIMEOUT_MS);
    }

    public HttpUrlConnectionTransport(int connectTimeoutMs, int readTimeoutMs) {
        if (connectTimeoutMs <= 0 || readTimeoutMs <= 0) {
            throw new IllegalArgumentException("timeouts must be positive");
        }
        this.connectTimeoutMs = connectTimeoutMs;
        this.readTimeoutMs = readTimeoutMs;
    }

    @Override
    public DownloadResult download(
            String url,
            File destination,
            boolean resume,
            long expectedTotalBytes,
            Progress progress,
            CancelSignal cancel) throws TransportException {
        validateUrl(url);
        if (destination == null) {
            throw new TransportException("invalid-destination", "download destination is missing");
        }
        File parent = destination.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new TransportException("io", "cannot create download directory");
        }

        long offset = resume && destination.isFile() ? destination.length() : 0L;
        if (expectedTotalBytes > 0 && offset > expectedTotalBytes) {
            if (!destination.delete()) {
                throw new TransportException("io", "cannot discard oversized partial download");
            }
            offset = 0L;
        }

        URL current = toUrl(url);
        for (int redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
            checkCancelled(cancel);
            HttpURLConnection connection = null;
            try {
                connection = open(current, offset);
                int code = connection.getResponseCode();
                if (isRedirect(code)) {
                    if (redirects == MAX_REDIRECTS) {
                        throw new TransportException("too-many-redirects",
                                "pack download redirected too many times");
                    }
                    String location = connection.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty()) {
                        throw new TransportException("invalid-redirect",
                                "redirect response has no Location header");
                    }
                    URL next = new URL(current, location.trim());
                    validateUrl(next.toString());
                    current = next;
                    continue;
                }
                if (code == 416) {
                    if (offset > 0) {
                        // The remote file no longer matches the partial bytes
                        // (or is shorter). Retry once from zero.
                        offset = 0L;
                        continue;
                    }
                    throw new TransportException("http-416",
                            "server rejected the byte range");
                }
                if (code == 206) {
                    long rangeStart = requireRangeStart(connection);
                    if (rangeStart != offset) {
                        throw new TransportException("range-mismatch",
                                "server returned range starting at " + rangeStart
                                        + " while " + offset + " was requested");
                    }
                    return receive(connection, destination, offset, true, code,
                            expectedTotalBytes, progress, cancel);
                }
                if (code == HttpURLConnection.HTTP_OK) {
                    // The server ignored Range: restart from the beginning.
                    return receive(connection, destination, 0L, false, code,
                            expectedTotalBytes, progress, cancel);
                }
                throw new TransportException("http-" + code,
                        "pack download failed with HTTP " + code);
            } catch (TransportException e) {
                throw e;
            } catch (IOException e) {
                throw new TransportException("io",
                        "pack download failed: " + e.getMessage(), e);
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }
        throw new TransportException("too-many-redirects", "redirect limit exceeded");
    }

    @Override
    public byte[] fetch(String url, int maxBytes) throws TransportException {
        validateUrl(url);
        if (maxBytes <= 0) {
            throw new TransportException("invalid-limit", "fetch limit must be positive");
        }
        URL current = toUrl(url);
        for (int redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
            HttpURLConnection connection = null;
            try {
                connection = open(current, 0L);
                int code = connection.getResponseCode();
                if (isRedirect(code)) {
                    if (redirects == MAX_REDIRECTS) {
                        throw new TransportException("too-many-redirects",
                                "metadata fetch redirected too many times");
                    }
                    String location = connection.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty()) {
                        throw new TransportException("invalid-redirect",
                                "redirect response has no Location header");
                    }
                    URL next = new URL(current, location.trim());
                    validateUrl(next.toString());
                    current = next;
                    continue;
                }
                if (code != HttpURLConnection.HTTP_OK) {
                    throw new TransportException("http-" + code,
                            "metadata fetch failed with HTTP " + code);
                }
                String contentEncoding = connection.getHeaderField("Content-Encoding");
                if (contentEncoding != null && !"identity".equalsIgnoreCase(contentEncoding)) {
                    throw new TransportException("content-encoding",
                            "server applied unsupported content encoding " + contentEncoding);
                }
                long declared = connection.getContentLengthLong();
                if (declared > maxBytes) {
                    throw new TransportException("too-large",
                            "metadata document exceeds " + maxBytes + " bytes");
                }
                try (InputStream in = new BufferedInputStream(connection.getInputStream())) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buffer = new byte[8 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        if (out.size() > maxBytes) {
                            throw new TransportException("too-large",
                                    "metadata document exceeds " + maxBytes + " bytes");
                        }
                    }
                    return out.toByteArray();
                }
            } catch (TransportException e) {
                throw e;
            } catch (IOException e) {
                throw new TransportException("io",
                        "metadata fetch failed: " + e.getMessage(), e);
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }
        throw new TransportException("too-many-redirects", "redirect limit exceeded");
    }

    private HttpURLConnection open(URL url, long offset) throws IOException, TransportException {
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(connectTimeoutMs);
        connection.setReadTimeout(readTimeoutMs);
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setRequestMethod("GET");
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setRequestProperty("Accept-Encoding", "identity");
        if (offset > 0) {
            connection.setRequestProperty("Range", "bytes=" + offset + "-");
        }
        return connection;
    }

    private DownloadResult receive(
            HttpURLConnection connection,
            File destination,
            long offset,
            boolean append,
            int statusCode,
            long expectedTotalBytes,
            Progress progress,
            CancelSignal cancel) throws IOException, TransportException {
        String contentEncoding = connection.getHeaderField("Content-Encoding");
        if (contentEncoding != null && !"identity".equalsIgnoreCase(contentEncoding)) {
            throw new TransportException("content-encoding",
                    "server applied unsupported content encoding " + contentEncoding);
        }
        long remoteLength = connection.getContentLengthLong();
        long remoteTotal = append ? parseRangeTotal(connection) : remoteLength;
        long downloaded = append ? destination.length() : 0L;
        long bytesReceived = 0L;
        if (progress != null) {
            progress.onProgress(downloaded, expectedTotalBytes > 0
                    ? expectedTotalBytes : remoteTotal);
        }
        try (InputStream in = new BufferedInputStream(connection.getInputStream());
                OutputStream out = new FileOutputStream(destination, append)) {
            byte[] buffer = new byte[BUFFER_BYTES];
            int read;
            while ((read = in.read(buffer)) != -1) {
                checkCancelled(cancel);
                out.write(buffer, 0, read);
                downloaded += read;
                bytesReceived += read;
                if (expectedTotalBytes > 0 && downloaded > expectedTotalBytes) {
                    throw new TransportException("size-mismatch",
                            "server sent more bytes than the manifest declares");
                }
                if (progress != null) {
                    progress.onProgress(downloaded, expectedTotalBytes > 0
                            ? expectedTotalBytes : remoteTotal);
                }
            }
            ((FileOutputStream) out).getFD().sync();
        }
        return new DownloadResult(downloaded, bytesReceived, remoteTotal, append && offset > 0, statusCode);
    }

    private static long parseRangeTotal(HttpURLConnection connection) {
        String contentRange = connection.getHeaderField("Content-Range");
        if (contentRange == null) {
            return -1L;
        }
        int slash = contentRange.lastIndexOf('/');
        if (slash < 0 || slash + 1 >= contentRange.length()) {
            return -1L;
        }
        String total = contentRange.substring(slash + 1).trim();
        if ("*".equals(total)) {
            return -1L;
        }
        try {
            return Long.parseLong(total);
        } catch (NumberFormatException e) {
            return -1L;
        }
    }

    private static long requireRangeStart(HttpURLConnection connection) throws TransportException {
        String contentRange = connection.getHeaderField("Content-Range");
        if (contentRange == null) {
            throw new TransportException("range-mismatch",
                    "partial response has no Content-Range header");
        }
        // Content-Range: bytes <start>-<end>/<total>
        String value = contentRange.trim();
        if (!value.startsWith("bytes ")) {
            throw new TransportException("range-mismatch", "malformed Content-Range header");
        }
        String range = value.substring("bytes ".length());
        int dash = range.indexOf('-');
        int slash = range.indexOf('/');
        if (dash <= 0 || slash <= dash) {
            throw new TransportException("range-mismatch", "malformed Content-Range header");
        }
        try {
            long start = Long.parseLong(range.substring(0, dash).trim());
            long end = Long.parseLong(range.substring(dash + 1, slash).trim());
            if (end < start) {
                throw new TransportException("range-mismatch", "invalid Content-Range bounds");
            }
            return start;
        } catch (NumberFormatException e) {
            throw new TransportException("range-mismatch", "malformed Content-Range header");
        }
    }

    private static boolean isRedirect(int code) {
        return code == HttpURLConnection.HTTP_MOVED_PERM
                || code == HttpURLConnection.HTTP_MOVED_TEMP
                || code == HttpURLConnection.HTTP_SEE_OTHER
                || code == 307
                || code == 308;
    }

    private static void checkCancelled(CancelSignal cancel) throws TransportException {
        if (cancel != null && cancel.isCancelled()) {
            throw new TransportException("cancelled", "pack download was cancelled");
        }
    }

    private static URL toUrl(String url) throws TransportException {
        try {
            return new URL(url);
        } catch (MalformedURLException e) {
            throw new TransportException("invalid-url", "pack URL is malformed", e);
        }
    }

    /**
     * Rejects non-HTTPS URLs and URLs that embed credentials. Package-visible
     * for transport tests that must not open a socket.
     */
    static void validateUrl(String url) throws TransportException {
        if (url == null || url.isEmpty() || url.length() > MAX_URL_LENGTH) {
            throw new TransportException("invalid-url", "pack URL is empty or too long");
        }
        URL parsed;
        try {
            parsed = new URL(url);
        } catch (MalformedURLException e) {
            throw new TransportException("invalid-url", "pack URL is malformed", e);
        }
        String protocol = parsed.getProtocol().toLowerCase(Locale.ROOT);
        if (!"https".equals(protocol)) {
            throw new TransportException("insecure-url", "pack transport requires HTTPS");
        }
        if (parsed.getHost() == null || parsed.getHost().trim().isEmpty()) {
            throw new TransportException("invalid-url", "pack URL has no host");
        }
        if (parsed.getUserInfo() != null) {
            throw new TransportException("credentials-in-url",
                    "credentials are not allowed in pack URLs");
        }
        if (parsed.getRef() != null) {
            throw new TransportException("invalid-url", "pack URL must not contain a fragment");
        }
    }
}
