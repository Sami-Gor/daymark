package io.github.sami_gor.daymark;

import java.util.Locale;

/**
 * Pure recovery policy for local WebView asset failures.
 *
 * A local application asset failure may show the native recovery screen once;
 * a reload gets one retry. A successful page load resets the policy so a later
 * independent failure can still be recovered. External API failures are never
 * local assets and are ignored by this class.
 */
final class WebViewRecoveryPolicy {

    enum Decision {
        IGNORE,
        SHOW_WITH_RETRY,
        SHOW_TERMINAL,
    }

    private boolean visible;
    private boolean retryAttempted;

    synchronized Decision onFailure() {
        if (visible) {
            return Decision.IGNORE;
        }
        visible = true;
        if (!retryAttempted) {
            retryAttempted = true;
            return Decision.SHOW_WITH_RETRY;
        }
        return Decision.SHOW_TERMINAL;
    }

    synchronized void onReloadStarted() {
        visible = false;
    }

    synchronized void onPageLoaded() {
        visible = false;
        retryAttempted = false;
    }

    /** Compare scheme and authority; a local API-like path is not enough. */
    static boolean isLocalAsset(String requestUrl, String localUrl) {
        String requestOrigin = originOf(requestUrl);
        String localOrigin = originOf(localUrl);
        return requestOrigin != null && requestOrigin.equals(localOrigin);
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
