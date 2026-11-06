package io.github.sami_gor.daymark;

import java.util.Locale;

/**
 * Pure state machine for native WebView recovery.
 *
 * <p>Two failure classes are deliberately separate:
 *
 * <ul>
 *   <li>A packaged local-asset failure can be retried once by reloading the
 *       live WebView.
 *   <li>A terminated renderer process makes that WebView unusable. Capacitor's
 *       {@code Bridge} owns a final WebView reference, so the only supported
 *       replacement is a fresh Activity/Bridge/WebView. The policy allows one
 *       such replacement, then falls back to terminal guidance. A dead
 *       renderer is never reloaded through the normal asset-retry path.
 * </ul>
 *
 * <p>The asset-retry cycle is reset only by {@link #onApplicationReady()},
 * which the client calls after it has verified that the application itself
 * rendered. A page-finished callback, including one for a WebView error page,
 * never resets the cycle on its own.
 */
final class WebViewRecoveryPolicy {

    enum AssetDecision {
        IGNORE,
        SHOW_WITH_RETRY,
        SHOW_TERMINAL,
    }

    enum RendererDecision {
        REPLACE_WEBVIEW,
        SHOW_TERMINAL,
    }

    private boolean recoveryVisible;
    private boolean reloadAttempted;
    private boolean rendererReplacementAttempted;
    private boolean navigationFailed;

    WebViewRecoveryPolicy() {
    }

    WebViewRecoveryPolicy(boolean rendererReplacementAttempted) {
        this.rendererReplacementAttempted = rendererReplacementAttempted;
    }

    synchronized AssetDecision onAssetFailure() {
        // Any asset failure in the current navigation means that navigation
        // must not be trusted as a successful application start.
        navigationFailed = true;
        if (recoveryVisible) {
            return AssetDecision.IGNORE;
        }
        recoveryVisible = true;
        if (!reloadAttempted) {
            reloadAttempted = true;
            return AssetDecision.SHOW_WITH_RETRY;
        }
        return AssetDecision.SHOW_TERMINAL;
    }

    synchronized void onReloadStarted() {
        recoveryVisible = false;
    }

    /** A new main-frame navigation starts a fresh readiness window. */
    synchronized void onNavigationStarted() {
        navigationFailed = false;
    }

    /**
     * Whether the page that just finished is eligible for a native readiness
     * check. This does not reset anything; only {@link #onApplicationReady()}
     * may do that, and only after the application itself is confirmed.
     */
    synchronized boolean onApplicationPageFinished(String finishedUrl, String appUrl) {
        return !navigationFailed && isApplicationUrl(finishedUrl, appUrl);
    }

    /**
     * Confirmed application-ready signal. The caller must have verified that
     * the packaged application actually rendered, not merely that a page
     * finished. This re-arms the asset-retry cycle, but deliberately does not
     * re-arm renderer replacement: that is one bounded attempt per app process.
     */
    synchronized void onApplicationReady() {
        recoveryVisible = false;
        reloadAttempted = false;
        navigationFailed = false;
    }

    synchronized RendererDecision onRendererGone() {
        if (rendererReplacementAttempted) {
            return RendererDecision.SHOW_TERMINAL;
        }
        rendererReplacementAttempted = true;
        return RendererDecision.REPLACE_WEBVIEW;
    }

    /** Compare scheme and authority; a local API-like path is not enough. */
    static boolean isLocalAsset(String requestUrl, String localUrl) {
        String requestOrigin = originOf(requestUrl);
        String localOrigin = originOf(localUrl);
        return requestOrigin != null && requestOrigin.equals(localOrigin);
    }

    /**
     * Whether a finished URL is the application entry point rather than a
     * Capacitor/WebView error page or another local document.
     */
    static boolean isApplicationUrl(String finishedUrl, String appUrl) {
        String finished = normalizedApplicationUrl(finishedUrl);
        String application = normalizedApplicationUrl(appUrl);
        return finished != null && finished.equals(application);
    }

    private static String normalizedApplicationUrl(String url) {
        if (url == null) {
            return null;
        }
        String trimmed = url.trim();
        String origin = originOf(trimmed);
        if (origin == null) {
            return null;
        }
        int authorityStart = trimmed.indexOf("://") + 3;
        int pathStart = trimmed.length();
        for (int i = authorityStart; i < trimmed.length(); i++) {
            if (trimmed.charAt(i) == '/') {
                pathStart = i;
                break;
            }
        }
        if (pathStart == trimmed.length()) {
            return origin;
        }
        int pathEnd = trimmed.length();
        for (int i = pathStart; i < trimmed.length(); i++) {
            char current = trimmed.charAt(i);
            if (current == '?' || current == '#') {
                pathEnd = i;
                break;
            }
        }
        String path = trimmed.substring(pathStart, pathEnd);
        while (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        return "/".equals(path) ? origin : origin + path;
    }

    /** Extracts scheme://authority without using java.net (no network surface). */
    private static String originOf(String url) {
        if (url == null) {
            return null;
        }
        String trimmed = url.trim();
        int schemeEnd = trimmed.indexOf("://");
        if (schemeEnd <= 0) {
            return null;
        }
        int authorityStart = schemeEnd + 3;
        int authorityEnd = trimmed.length();
        for (char delimiter : new char[] {'/', '?', '#'}) {
            int found = trimmed.indexOf(delimiter, authorityStart);
            if (found >= 0 && found < authorityEnd) {
                authorityEnd = found;
            }
        }
        if (authorityEnd <= authorityStart) {
            return null;
        }
        return trimmed.substring(0, authorityEnd).toLowerCase(Locale.ROOT);
    }
}
