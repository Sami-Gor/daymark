package io.github.sami_gor.daymark;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;

import com.getcapacitor.BridgeActivity;

import io.github.sami_gor.daymark.voice.DaymarkVoicePlugin;
import io.github.sami_gor.daymark.voice.ParakeetSpeechRecognitionPlugin;

public class MainActivity extends BridgeActivity {

    /**
     * One renderer replacement is allowed per app process. A static survives
     * the Activity recreation used to build a fresh Bridge/WebView, but resets
     * when the user starts a genuinely new process.
     */
    private static boolean rendererReplacementAttempted;

    private final WebViewRecoveryPolicy recoveryPolicy =
            new WebViewRecoveryPolicy(rendererReplacementAttempted);
    private View recoveryOverlay;
    private boolean rendererReplacementScheduled;

    @Override
    public void onRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        ParakeetSpeechRecognitionPlugin.onRequestPermissionsResult(
                requestCode, permissions, grantResults);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Very old WebViews cannot parse the production bundle; show a native
        // "update Android System WebView" message instead of a blank shell.
        if (!WebViewCompatibilityScreen.isCurrentWebViewSupported(this)) {
            super.onCreate(savedInstanceState);
            WebViewCompatibilityScreen.show(this);
            return;
        }
        if (!WebViewCompatibilityScreen.hasRequiredAssets(this)) {
            super.onCreate(savedInstanceState);
            WebViewCompatibilityScreen.showMissingAssets(this);
            return;
        }
        registerPlugin(DaymarkVoicePlugin.class);
        registerPlugin(ParakeetSpeechRecognitionPlugin.class);
        registerPlugin(DaymarkRecoveryPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge != null) {
            bridge.setWebViewClient(new DaymarkWebViewClient(this, bridge));
        }
    }

    /**
     * Called by the narrow recovery bridge or by the native WebViewClient for
     * a documented local application-asset failure. External API failures
     * never reach this method.
     */
    void onLocalApplicationAssetFailure() {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) {
                return;
            }
            WebViewRecoveryPolicy.AssetDecision decision = recoveryPolicy.onAssetFailure();
            if (decision == WebViewRecoveryPolicy.AssetDecision.IGNORE) {
                return;
            }
            if (decision == WebViewRecoveryPolicy.AssetDecision.SHOW_WITH_RETRY) {
                showRecoveryOverlay(true);
            } else {
                showRecoveryOverlay(false);
            }
        });
    }

    /**
     * Called after the client verified that the application rendered into its
     * root element. This is the only signal that re-arms the retry cycle. A
     * currently visible failure screen is authoritative, so a late/stale probe
     * cannot hide it.
     */
    void onLocalApplicationReady() {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed() || recoveryOverlay != null) {
                return;
            }
            recoveryPolicy.onApplicationReady();
        });
    }

    void onLocalApplicationNavigationStarted() {
        recoveryPolicy.onNavigationStarted();
    }

    /** @return whether the finished page is eligible for a readiness probe. */
    boolean onLocalApplicationPageFinished(String url) {
        return recoveryPolicy.onApplicationPageFinished(
                url, bridge != null ? bridge.getAppUrl() : null);
    }

    /**
     * A terminated renderer cannot be reused. Capacitor's Bridge exposes the
     * WebView as a final field, so the supported replacement is a fresh
     * Activity/Bridge/WebView. One replacement is attempted; a second
     * termination shows terminal guidance instead of looping.
     */
    void onWebViewRendererGone() {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed() || rendererReplacementScheduled) {
                return;
            }
            WebViewRecoveryPolicy.RendererDecision decision = recoveryPolicy.onRendererGone();
            if (decision == WebViewRecoveryPolicy.RendererDecision.REPLACE_WEBVIEW) {
                rendererReplacementScheduled = true;
                rendererReplacementAttempted = true;
                dismissRecoveryOverlay();
                // Post the recreation so the WebViewClient callback can return
                // before the current Activity is torn down.
                if (getWindow() != null) {
                    getWindow().getDecorView().post(this::recreate);
                } else {
                    recreate();
                }
            } else {
                dismissRecoveryOverlay();
                recoveryOverlay = WebViewCompatibilityScreen.showRendererUnavailable(this);
            }
        });
    }

    private void showRecoveryOverlay(boolean withRetry) {
        dismissRecoveryOverlay();
        if (withRetry) {
            recoveryOverlay = WebViewCompatibilityScreen.showRecovery(this, this::retryLocalAssets);
        } else {
            recoveryOverlay = WebViewCompatibilityScreen.showRecoveryTerminal(this);
        }
    }

    private void retryLocalAssets() {
        dismissRecoveryOverlay();
        recoveryPolicy.onReloadStarted();
        if (bridge == null) {
            return;
        }
        // The live WebView is still attached to Capacitor's original root, so
        // reloading it in place keeps the parent and root layout intact. Only a
        // dead renderer takes the replacement path above.
        bridge.reload();
    }

    private void dismissRecoveryOverlay() {
        View overlay = recoveryOverlay;
        recoveryOverlay = null;
        if (overlay != null && overlay.getParent() instanceof ViewGroup) {
            ((ViewGroup) overlay.getParent()).removeView(overlay);
        }
    }
}
