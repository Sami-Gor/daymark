package io.github.sami_gor.daymark;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import io.github.sami_gor.daymark.voice.DaymarkVoicePlugin;
import io.github.sami_gor.daymark.voice.SystemSpeechPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DaymarkVoicePlugin.class);
        registerPlugin(SystemSpeechPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
