package io.github.sami_gor.daymark;

import android.graphics.Bitmap;
import android.net.Uri;
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
 * <p>Requests are filtered by the Bridge's resolved local URL. Remote weather
 * and geocoding requests are deliberately ignored; they belong to the ordinary
 * weather error UI, not the native application-recovery screen.
 */
final class DaymarkWebViewClient extends BridgeWebViewClient {

    private final MainActivity activity;
    private final Bridge bridge;

    DaymarkWebViewClient(MainActivity activity, Bridge bridge) {
        super(bridge);
        this.activity = activity;
        this.bridge = bridge;
    }

    private boolean isLocalAsset(Uri uri) {
        return uri != null
                && WebViewRecoveryPolicy.isLocalAsset(uri.toString(), bridge.getLocalUrl());
    }

    @Override
    public void onReceivedError(
            WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (request == null || error == null || !request.isForMainFrame()
                && !isLocalAsset(request.getUrl())) {
            return;
        }
        activity.onLocalApplicationAssetFailure();
    }

    @Override
    public void onReceivedHttpError(
            WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        super.onReceivedHttpError(view, request, errorResponse);
        if (request == null || errorResponse == null || !request.isForMainFrame()
                && !isLocalAsset(request.getUrl())) {
            return;
        }
        activity.onLocalApplicationAssetFailure();
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (WebViewRecoveryPolicy.isLocalAsset(url, bridge.getLocalUrl())) {
            activity.onLocalApplicationPageLoaded();
        }
    }

    @Override
    public void onPageStarted(WebView view, String url, Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        super.onRenderProcessGone(view, detail);
        activity.onLocalApplicationAssetFailure();
        return true;
    }
}
