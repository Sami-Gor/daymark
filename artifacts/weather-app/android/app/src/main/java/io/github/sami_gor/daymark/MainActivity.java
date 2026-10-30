package io.github.sami_gor.daymark;

import android.os.Bundle;

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
    }
}
