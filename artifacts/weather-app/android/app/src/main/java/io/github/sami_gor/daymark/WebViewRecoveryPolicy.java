package io.github.sami_gor.daymark;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Pure recovery budget and navigation rules for WebView renderer loss.
 *
 * <p>This class deliberately has no Android dependencies so the rules can be
 * exercised by JVM unit tests. The policy is the fix for the WS12 static FAIL
 * ("no listener / no errorPath / no in-place recovery"):
 *
 * <ul>
 *   <li>at most {@link #MAX_AUTO_RECOVERIES} automatic reload/recreate attempts inside
 *       {@link #RECOVERY_WINDOW_MS}; a crash loop therefore becomes a visible error screen
 *       instead of an infinite reload loop;</li>
 *   <li>the budget is only cleared after the page has stayed up for
 *       {@link #STABLE_RESET_MS}, so a page that crashes immediately after every reload cannot
 *       reset its own budget;</li>
 *   <li>only bundled Daymark routes served from the Capacitor app origin may be captured and
 *       restored as the "last navigation"; the error page itself is never restored.</li>
 * </ul>
 *
 * <p>The app origin is supplied by the caller from Capacitor's Bridge (the app already loads it),
 * so this class introduces no URL literal and no network API of its own.
 */
public final class WebViewRecoveryPolicy {

    /** Asset served through server.errorPath when the main frame fails to load. */
    public static final String ERROR_PAGE = "recovery.html";
    /** Automatic recovery attempts allowed inside one recovery window. */
    public static final int MAX_AUTO_RECOVERIES = 2;
    /** Sliding window for the automatic recovery budget. */
    public static final long RECOVERY_WINDOW_MS = 120_000L;
    /** How long a recovered page must stay up before the budget is cleared. */
    public static final long STABLE_RESET_MS = 30_000L;
    /** A pending navigation restore is discarded after this long. */
    public static final long PENDING_RESTORE_TTL_MS = 5 * 60_000L;

    private static final int MAX_SERIALIZED_ATTEMPTS = 16;

    /** SPA routes rendered by the bundled app; restoring one re-renders the same screen. */
    private static final String[] RESTORABLE_PATHS = {
        "/",
        "/privacy",
        "/fr/privacy",
        "/es/privacy",
        "/store-preview"
    };

    private final int maxAutoRecoveries;
    private final long windowMs;
    private final long stableResetMs;
    private final Deque<Long> attemptTimestamps = new ArrayDeque<>();

    public WebViewRecoveryPolicy(int maxAutoRecoveries, long windowMs, long stableResetMs) {
        if (maxAutoRecoveries < 1) {
            throw new IllegalArgumentException("maxAutoRecoveries must be >= 1");
        }
        if (windowMs <= 0) {
            throw new IllegalArgumentException("windowMs must be > 0");
        }
        if (stableResetMs < 0) {
            throw new IllegalArgumentException("stableResetMs must be >= 0");
        }
        this.maxAutoRecoveries = maxAutoRecoveries;
        this.windowMs = windowMs;
        this.stableResetMs = stableResetMs;
    }

    public static WebViewRecoveryPolicy defaults() {
        return new WebViewRecoveryPolicy(MAX_AUTO_RECOVERIES, RECOVERY_WINDOW_MS, STABLE_RESET_MS);
    }

    /** @return automatic attempts still inside the sliding window (prunes stale entries). */
    public int attemptsInWindow(long nowMs) {
        prune(nowMs);
        return attemptTimestamps.size();
    }

    /** @return true while another automatic reload/recreate is allowed. */
    public boolean canAttempt(long nowMs) {
        return attemptsInWindow(nowMs) < maxAutoRecoveries;
    }

    /** @return true when the automatic budget is spent and the error screen must be shown. */
    public boolean isExhausted(long nowMs) {
        return !canAttempt(nowMs);
    }

    /**
     * Records one automatic reload/recreate attempt.
     *
     * @return true when the attempt is inside the budget; false when the budget is exhausted
     *     (nothing is recorded in that case).
     */
    public boolean recordAttempt(long nowMs) {
        prune(nowMs);
        if (attemptTimestamps.size() >= maxAutoRecoveries) {
            return false;
        }
        attemptTimestamps.addLast(nowMs);
        return true;
    }

    /**
     * Reports a page that has stayed visible for the stable interval and clears the budget.
     *
     * @return true when the budget was cleared by this call.
     */
    public boolean onStablePage(long nowMs) {
        prune(nowMs);
        if (attemptTimestamps.isEmpty()) {
            return false;
        }
        Long last = attemptTimestamps.peekLast();
        if (last != null && nowMs - last.longValue() >= stableResetMs) {
            attemptTimestamps.clear();
            return true;
        }
        return false;
    }

    /** Clears the budget; used for an explicit user-initiated retry only. */
    public void reset() {
        attemptTimestamps.clear();
    }

    /** Serializes the attempt timestamps for durable storage (empty string when none). */
    public String serialize() {
        StringBuilder builder = new StringBuilder();
        boolean first = true;
        for (Long timestamp : attemptTimestamps) {
            if (!first) {
                builder.append(',');
            }
            first = false;
            builder.append(timestamp.longValue());
        }
        return builder.toString();
    }

    /** Rebuilds a policy from {@link #serialize()} output; malformed tokens are ignored. */
    public static WebViewRecoveryPolicy deserialize(String encoded) {
        WebViewRecoveryPolicy policy = defaults();
        if (encoded == null) {
            return policy;
        }
        String[] tokens = encoded.split(",");
        int first = Math.max(0, tokens.length - MAX_SERIALIZED_ATTEMPTS);
        for (int i = first; i < tokens.length; i++) {
            String token = tokens[i].trim();
            if (token.isEmpty()) {
                continue;
            }
            try {
                long value = Long.parseLong(token);
                if (value > 0) {
                    policy.attemptTimestamps.addLast(value);
                }
            } catch (NumberFormatException ignored) {
                // Corrupted preference: ignore the token instead of failing at runtime.
            }
        }
        while (policy.attemptTimestamps.size() > MAX_SERIALIZED_ATTEMPTS) {
            policy.attemptTimestamps.removeFirst();
        }
        return policy;
    }

    /**
     * @return true when {@code url} is the bundled recovery/error page under {@code appUrl}
     *     (the Capacitor app origin supplied by the Bridge).
     */
    public static boolean isErrorPageUrl(String url, String appUrl) {
        String path = pathWithinApp(url, appUrl);
        return path != null && ("/" + ERROR_PAGE).equals(path);
    }

    /**
     * @return true when {@code url} is a bundled app route under {@code appUrl} that may be
     *     captured before a renderer restart and restored afterwards.
     */
    public static boolean isRestorableAppUrl(String url, String appUrl) {
        String path = pathWithinApp(url, appUrl);
        if (path == null) {
            return false;
        }
        for (String restorablePath : RESTORABLE_PATHS) {
            if (restorablePath.equals(path)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns the path of {@code url} when it is served by the Capacitor app origin
     * {@code appUrl}; the query/fragment is stripped. Any other origin (or a look-alike
     * host that merely starts with the same characters) returns null.
     */
    private static String pathWithinApp(String url, String appUrl) {
        if (url == null || appUrl == null || appUrl.isEmpty()) {
            return null;
        }
        String prefix = appUrl.endsWith("/") ? appUrl : appUrl + "/";
        if (!url.startsWith(prefix)) {
            return null;
        }
        // Keep the leading slash from the origin prefix; drop everything after ? or #.
        String remainder = url.substring(prefix.length() - 1);
        int cut = remainder.length();
        for (int i = 0; i < remainder.length(); i++) {
            char character = remainder.charAt(i);
            if (character == '?' || character == '#') {
                cut = i;
                break;
            }
        }
        return remainder.substring(0, cut);
    }

    /** @return true when a captured navigation is still recent enough to restore. */
    public static boolean isPendingRestoreFresh(long savedAtMs, long nowMs) {
        if (savedAtMs <= 0) {
            return false;
        }
        if (nowMs < savedAtMs) {
            return false;
        }
        return nowMs - savedAtMs <= PENDING_RESTORE_TTL_MS;
    }

    private void prune(long nowMs) {
        while (!attemptTimestamps.isEmpty()) {
            long oldest = attemptTimestamps.peekFirst().longValue();
            if (nowMs - oldest > windowMs) {
                attemptTimestamps.removeFirst();
            } else {
                break;
            }
        }
    }
}
