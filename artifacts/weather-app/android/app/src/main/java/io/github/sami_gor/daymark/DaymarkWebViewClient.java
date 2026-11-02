package io.github.sami_gor.daymark;

import android.graphics.Bitmap;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Keeps Capacitor's normal WebView client behaviour and adds a recovery path
 * for failures of packaged local assets after the bridge has started.
 *
 * <p>Requests are filtered by the Bridge's resolved local origin. Remote
 * weather and geocoding requests are deliberately ignored; they belong to the
 * ordinary weather error UI, not the native application-recovery screen.
 *
 * <p>"Page finished" is not treated as proof that the application started.
 * Instead, the client probes the rendered document for the application root and
 * reports readiness only when that root contains content. Error pages, failed
 * navigations and sub-resource failures therefore cannot clear the retry cycle.
 */
final class DaymarkWebViewClient extends BridgeWebViewClient {

    /**
     * The application entry point is expected to render into {@code #root}.
     * Check for actual children so an empty shell or error page does not count.
     */
    private static final String APPLICATION_READY_JS =
            "(function(){try{var root=document.getElementById('root');"
                    + "return !!(root && root.childElementCount>0);}"
                    + "catch(e){return false;}})()";

    private static final long[] READY_PROBE_DELAYS_MS = {0L, 500L, 1500L};

    private final MainActivity activity;
    private final Bridge bridge;

    private int navigationGeneration;
    private boolean navigationFailed;

    DaymarkWebViewClient(MainActivity activity, Bridge bridge) {
        super(bridge);
        this.activity = activity;
        this.bridge = bridge;
    }

    private boolean isLocalAssetUrl(String url) {
        return WebViewRecoveryPolicy.isLocalAsset(url, bridge.getLocalUrl());
    }

    @Override
    public void onReceivedError(
            WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (request == null || request.getUrl() == null || error == null
                || !isLocalAssetUrl(request.getUrl().toString())) {
            return;
        }
        navigationFailed = true;
        activity.onLocalApplicationAssetFailure();
    }

    @Override
    public void onReceivedHttpError(
            WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        super.onReceivedHttpError(view, request, errorResponse);
        if (request == null || request.getUrl() == null || errorResponse == null
                || !isLocalAssetUrl(request.getUrl().toString())) {
            return;
        }
        navigationFailed = true;
        activity.onLocalApplicationAssetFailure();
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
        if (isLocalAssetUrl(url)) {
            navigationGeneration++;
            navigationFailed = false;
            activity.onLocalApplicationNavigationStarted();
        }
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (!activity.onLocalApplicationPageFinished(url)) {
            return;
        }
        scheduleApplicationReadyProbe(view, navigationGeneration, 0);
    }

    private void scheduleApplicationReadyProbe(WebView view, int generation, int attempt) {
        if (attempt >= READY_PROBE_DELAYS_MS.length) {
            return;
        }
        view.postDelayed(() -> {
            if (generation != navigationGeneration || navigationFailed) {
                return;
            }
            try {
                view.evaluateJavascript(APPLICATION_READY_JS, result -> {
                    if (generation != navigationGeneration || navigationFailed) {
                        return;
                    }
                    if ("true".equals(result)) {
                        activity.onLocalApplicationReady();
                    } else {
                        scheduleApplicationReadyProbe(view, generation, attempt + 1);
                    }
                });
            } catch (RuntimeException ignored) {
                // The WebView is being torn down. A later navigation reschedules.
            }
        }, READY_PROBE_DELAYS_MS[attempt]);
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        super.onRenderProcessGone(view, detail);
        // Returning true tells the platform that the host handles the crash.
        // The dead WebView is never reloaded or reused.
        activity.onWebViewRendererGone();
        return true;
    }
}
