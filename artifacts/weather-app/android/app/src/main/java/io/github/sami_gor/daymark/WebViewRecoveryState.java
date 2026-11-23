package io.github.sami_gor.daymark;

/**
 * In-process state for the bounded WebView renderer-recovery path.
 *
 * <p>The state lives only in memory, on purpose:
 *
 * <ul>
 *   <li>it survives the {@code Activity.recreate()} that rebuilds Capacitor's
 *       Bridge/WebView because that happens inside the same app process;</li>
 *   <li>it adds no new persistent storage, so the app's documented storage
 *       surface (the locale preference and the microphone-prompt flag) and its
 *       privacy statements are unchanged by this fix;</li>
 *   <li>a fresh process starts with a fresh budget, and re-entering the app is a
 *       user action, so the crash-loop bound cannot be bypassed silently.</li>
 * </ul>
 *
 * <p>The recovery budget itself (attempts, window, stable-page reset) and the
 * URL rules live in {@link WebViewRecoveryPolicy}; this class only owns the
 * mutable instance and the last-navigation slot. It has no Android dependency,
 * so it is unit-testable on the JVM.
 */
public final class WebViewRecoveryState {

    private static final WebViewRecoveryState INSTANCE = new WebViewRecoveryState();

    private final WebViewRecoveryPolicy policy = WebViewRecoveryPolicy.defaults();
    private String pendingRestoreUrl;
    private long pendingRestoreSavedAtMs;
    private boolean rebuildPending;

    private WebViewRecoveryState() {
    }

    /** @return the per-process recovery state. */
    public static WebViewRecoveryState get() {
        return INSTANCE;
    }

    /** @return the live bounded recovery budget. */
    public synchronized WebViewRecoveryPolicy policy() {
        return policy;
    }

    /** Clears the automatic budget; only an explicit user retry should call this. */
    public synchronized void resetPolicy() {
        policy.reset();
    }

    /** Remembers an already-validated navigation to restore after the WebView recreation. */
    public synchronized void savePendingRestoreUrl(String url, long nowMs) {
        if (url == null) {
            return;
        }
        pendingRestoreUrl = url;
        pendingRestoreSavedAtMs = nowMs;
    }

    /** @return true when a navigation restore is waiting for the recreated WebView. */
    public synchronized boolean hasPendingRestoreUrl() {
        return pendingRestoreUrl != null;
    }

    /** @return when the pending navigation was captured (0 when nothing is pending). */
    public synchronized long pendingRestoreSavedAtMs() {
        return pendingRestoreSavedAtMs;
    }

    /** Marks the bounded rebuild this Activity recreation is performing. */
    public synchronized void markRebuildPending() {
        rebuildPending = true;
    }

    /** @return true while an accepted bounded rebuild has not loaded a page yet. */
    public synchronized boolean hasRebuildPending() {
        return rebuildPending;
    }

    /** Clears the accepted-rebuild marker once the rebuilt WebView has loaded a page. */
    public synchronized void clearRebuildPending() {
        rebuildPending = false;
    }

    /** Reads and clears the pending navigation restore. */
    public synchronized String consumePendingRestoreUrl() {
        String url = pendingRestoreUrl;
        pendingRestoreUrl = null;
        pendingRestoreSavedAtMs = 0L;
        return url;
    }
}
