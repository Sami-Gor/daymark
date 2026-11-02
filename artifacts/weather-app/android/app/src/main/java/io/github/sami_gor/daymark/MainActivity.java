package io.github.sami_gor.daymark;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import io.github.sami_gor.daymark.voice.DaymarkVoicePlugin;
import io.github.sami_gor.daymark.voice.ParakeetSpeechRecognitionPlugin;

public class MainActivity extends BridgeActivity {
    private final WebViewRecoveryPolicy recoveryPolicy = new WebViewRecoveryPolicy();

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
            WebViewRecoveryPolicy.Decision decision = recoveryPolicy.onFailure();
            if (decision == WebViewRecoveryPolicy.Decision.IGNORE) {
                return;
            }
            if (decision == WebViewRecoveryPolicy.Decision.SHOW_WITH_RETRY) {
                WebViewCompatibilityScreen.showRecovery(this, () -> {
                    recoveryPolicy.onReloadStarted();
                    if (bridge != null) {
                        setContentView(bridge.getWebView());
                        bridge.reload();
                    }
                });
            } else {
                WebViewCompatibilityScreen.showRecovery(this, null);
            }
        });
    }

    void onLocalApplicationPageLoaded() {
        recoveryPolicy.onPageLoaded();
    }
}
