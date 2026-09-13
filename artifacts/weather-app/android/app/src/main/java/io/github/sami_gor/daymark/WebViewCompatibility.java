package io.github.sami_gor.daymark;

/**
 * Pure WebView version compatibility rules (unit-testable, no Android deps).
 *
 * The production bundle (Vite 7 + React 19) needs ES2020 syntax (optional
 * chaining / nullish coalescing, Chrome/WebView 80) and has been validated on
 * WebView 91+. The guard is set to 90 to keep every validated device working
 * while blocking pre-2020 WebViews that cannot parse or safely run the bundle
 * (e.g. the API 24 stock WebView 53, which fails with a SyntaxError and leaves
 * a blank shell).
 */
public final class WebViewCompatibility {

    public static final int MINIMUM_WEBVIEW_MAJOR = 90;

    private WebViewCompatibility() {
    }

    /** Extracts the leading numeric major version from a WebView version name. */
    public static Integer parseMajorVersion(String versionName) {
        if (versionName == null) {
            return null;
        }
        String trimmed = versionName.trim();
        int end = 0;
        while (end < trimmed.length() && Character.isDigit(trimmed.charAt(end))) {
            end += 1;
        }
        if (end == 0) {
            return null;
        }
        try {
            return Integer.parseInt(trimmed.substring(0, end));
        } catch (NumberFormatException failure) {
            return null;
        }
    }

    /** An unknown/null package is treated as unsupported so we fail visibly. */
    public static boolean isSupported(Integer majorVersion) {
        return majorVersion != null && majorVersion >= MINIMUM_WEBVIEW_MAJOR;
    }

    public static boolean isSupportedVersionName(String versionName) {
        return isSupported(parseMajorVersion(versionName));
    }
}
