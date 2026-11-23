package io.github.sami_gor.daymark;

import android.os.Bundle;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

import io.github.sami_gor.daymark.voice.DaymarkVoicePlugin;
import io.github.sami_gor.daymark.voice.ParakeetSpeechRecognitionPlugin;

public class MainActivity extends BridgeActivity {

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
        registerPlugin(DaymarkVoicePlugin.class);
        registerPlugin(ParakeetSpeechRecognitionPlugin.class);
        super.onCreate(savedInstanceState);

        // Renderer loss recovery (WS12): handle onRenderProcessGone instead of letting
        // Capacitor return false, which is fatal to the app process. This must be
        // registered before the user can interact with the WebView.
        WebViewRecoveryState recoveryState = WebViewRecoveryState.get();
        Bridge bridge = getBridge();
        if (bridge != null) {
            bridge.addWebViewListener(
                    new DaymarkWebViewListener(this, recoveryState, bridge.getAppUrl()));
        }

        // If a crash loop already exhausted the bounded recovery budget, do not
        // pretend the app is healthy: show the explicit localized error screen.
        // Exception: a pending navigation restore means this Activity is the
        // bounded rebuild itself, so let the listener finish that recovery.
        if (!recoveryState.hasPendingRestoreUrl()
                && recoveryState.policy().isExhausted(System.currentTimeMillis())) {
            WebViewRecoveryScreen.showTerminal(this, new Runnable() {
                @Override
                public void run() {
                    WebViewRecoveryState.get().resetPolicy();
                    recreate();
                }
            });
        }
    }
}
