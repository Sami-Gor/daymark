package io.github.sami_gor.daymark;

import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Recovers the Daymark WebView after its renderer process dies.
 *
 * <p>Before this listener existed, Daymark registered no {@link WebViewListener};
 * Capacitor's {@code BridgeWebViewClient.onRenderProcessGone} therefore returned
 * false and an unhandled renderer death was fatal to the app process (WS12
 * static FAIL). This listener:
 *
 * <ol>
 *   <li>always returns true so the renderer death is handled instead of killing the app;</li>
 *   <li>captures the current bundled-app URL synchronously before the renderer is lost;</li>
 *   <li>recreates the Activity (and therefore Capacitor's Bridge/WebView) for at most
 *       {@link WebViewRecoveryPolicy#MAX_AUTO_RECOVERIES} attempts inside
 *       {@link WebViewRecoveryPolicy#RECOVERY_WINDOW_MS};</li>
 *   <li>restores the captured SPA route once the new WebView has loaded the shell;</li>
 *   <li>shows an explicit native error screen with a retry button when the budget is
 *       exhausted, so a crash loop is visible and bounded instead of silent or infinite;</li>
 *   <li>clears the budget only after the page has stayed up for the stable interval.</li>
 * </ol>
 *
 * <p>The budget and the pending navigation live in {@link WebViewRecoveryState}, which
 * survives the Activity recreation inside the same process without adding any new
 * persistent storage.
 */
public final class DaymarkWebViewListener extends WebViewListener {

    private static final long RECOVERING_SCREEN_DELAY_MS = 250L;

    private final BridgeActivity activity;
    private final WebViewRecoveryState state;
    private final String appUrl;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean pendingRestoreConsumed = false;
    private Runnable stablePageResetTask;
    private WebView stablePageResetView;

    /**
     * @param appUrl Capacitor's app origin from {@code Bridge.getAppUrl()}; used to decide
     *     whether a captured URL is a bundled Daymark route. Read from the Bridge so the app
     *     does not duplicate the origin as a hard-coded literal.
     */
    public DaymarkWebViewListener(BridgeActivity activity, WebViewRecoveryState state, String appUrl) {
        if (activity == null) {
            throw new NullPointerException("activity");
        }
        if (state == null) {
            throw new NullPointerException("state");
        }
        this.activity = activity;
        this.state = state;
        this.appUrl = appUrl;
    }

    @Override
    public void onPageLoaded(WebView webView) {
        if (webView == null || activity.isFinishing() || activity.isDestroyed()) {
            return;
        }
        // The accepted rebuild has loaded a page: it is no longer pending.
        state.clearRebuildPending();
        // Only one stable-page timer may be pending; a newer load supersedes it.
        cancelStablePageReset();
        String url = webView.getUrl();
        if (WebViewRecoveryPolicy.isErrorPageUrl(url, appUrl)) {
            // The errorPath page is itself the visible recovery UI. Never treat it
            // as a healthy load and never restore it as a navigation target.
            return;
        }
        if (!pendingRestoreConsumed) {
            pendingRestoreConsumed = true;
            long savedAt = state.pendingRestoreSavedAtMs();
            String previousUrl = state.consumePendingRestoreUrl();
            if (previousUrl != null
                    && WebViewRecoveryPolicy.isPendingRestoreFresh(savedAt, System.currentTimeMillis())
                    && WebViewRecoveryPolicy.isRestorableAppUrl(previousUrl, appUrl)
                    && !previousUrl.equals(url)) {
                webView.loadUrl(previousUrl);
                return;
            }
        }
        scheduleStablePageReset(webView);
    }

    private void scheduleStablePageReset(final WebView webView) {
        cancelStablePageReset();
        stablePageResetTask = new Runnable() {
            @Override
            public void run() {
                if (activity.isFinishing() || activity.isDestroyed()) {
                    return;
                }
                // In-process state is mutated directly; nothing to persist.
                state.policy().onStablePage(System.currentTimeMillis());
            }
        };
        stablePageResetView = webView;
        webView.postDelayed(stablePageResetTask, WebViewRecoveryPolicy.STABLE_RESET_MS);
    }

    private void cancelStablePageReset() {
        if (stablePageResetTask != null && stablePageResetView != null) {
            stablePageResetView.removeCallbacks(stablePageResetTask);
        }
        stablePageResetTask = null;
        stablePageResetView = null;
    }

    @Override
    public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
        long now = System.currentTimeMillis();
        String currentUrl = null;
        try {
            if (webView != null) {
                currentUrl = webView.getUrl();
            }
        } catch (Throwable ignored) {
            // A dead WebView may throw from getUrl(); recovery still proceeds.
        }
        if (currentUrl != null && WebViewRecoveryPolicy.isRestorableAppUrl(currentUrl, appUrl)) {
            state.savePendingRestoreUrl(currentUrl, now);
        }

        boolean canRecover = state.policy().recordAttempt(now);
        if (canRecover) {
            // The recreated Activity is an accepted bounded rebuild, not a fresh start.
            state.markRebuildPending();
        } else {
            // Denied recovery must not leave a route that later Activity recreation
            // could mistake for an authorized rebuild.
            state.consumePendingRestoreUrl();
        }
        cancelStablePageReset();
        destroyWebView(webView);

        if (activity.isFinishing() || activity.isDestroyed()) {
            return true;
        }
        if (canRecover) {
            showRecoveringThenRecreate();
        } else {
            showTerminalFallback();
        }
        // Always handled: returning false lets an unhandled renderer death kill the process.
        return true;
    }

    private void destroyWebView(WebView webView) {
        if (webView == null) {
            return;
        }
        try {
            // Android requires the WebView to leave the view hierarchy before destroy().
            if (webView.getParent() instanceof ViewGroup) {
                ((ViewGroup) webView.getParent()).removeView(webView);
            }
        } catch (Throwable ignored) {
            // A dead WebView may reject detach; destroy() still runs below.
        }
        try {
            webView.destroy();
        } catch (Throwable ignored) {
            // Best effort; the Activity is recreated next.
        }
    }

    private void showRecoveringThenRecreate() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (activity.isFinishing() || activity.isDestroyed()) {
                    return;
                }
                WebViewRecoveryScreen.showRecovering(activity);
                mainHandler.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        if (activity.isFinishing() || activity.isDestroyed()) {
                            return;
                        }
                        activity.recreate();
                    }
                }, RECOVERING_SCREEN_DELAY_MS);
            }
        });
    }

    private void showTerminalFallback() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (activity.isFinishing() || activity.isDestroyed()) {
                    return;
                }
                WebViewRecoveryScreen.showTerminal(activity, new Runnable() {
                    @Override
                    public void run() {
                        // Explicit user retry: reset the automatic budget once, then rebuild.
                        state.resetPolicy();
                        activity.recreate();
                    }
                });
            }
        });
    }
}
