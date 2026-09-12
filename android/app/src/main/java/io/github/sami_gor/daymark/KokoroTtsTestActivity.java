package io.github.sami_gor.daymark;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import io.github.sami_gor.daymark.tts.KokoroLocalTtsEngine;
import io.github.sami_gor.daymark.tts.LocalTtsEngine;

/**
 * Native-only proof-of-concept screen for the bundled Kokoro voice.
 *
 * Separate from the Sherpa POC and not reachable from the Daymark TWA UI;
 * launch manually while validating the Kokoro integration:
 *
 *   adb shell am start -n io.github.sami_gor.daymark/.KokoroTtsTestActivity
 */
public class KokoroTtsTestActivity extends Activity implements LocalTtsEngine.Listener {

    private static final String TAG = "DaymarkKokoroTts";
    private static final String TEST_SENTENCE =
            "Good morning. Light rain is expected this afternoon.";

    private LocalTtsEngine engine;
    private TextView statusView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(padding, padding, padding, padding);
        root.setBackgroundColor(Color.WHITE);

        TextView title = new TextView(this);
        title.setText("Daymark Kokoro Voice Test");
        title.setTextSize(22);
        title.setTextColor(Color.BLACK);
        title.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Bundled voice: bm_fable (Kokoro-82M quantized, offline)");
        subtitle.setTextSize(12);
        subtitle.setTextColor(Color.DKGRAY);
        subtitle.setGravity(Gravity.CENTER_HORIZONTAL);
        subtitle.setPadding(0, padding / 2, 0, padding);
        root.addView(subtitle);

        Button testButton = new Button(this);
        testButton.setText("Test Local Voice");
        testButton.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        testButton.setOnClickListener(v -> {
            Log.i(TAG, "test button pressed; synthesizing test sentence");
            engine.speak(TEST_SENTENCE);
        });
        root.addView(testButton);

        Button stopButton = new Button(this);
        stopButton.setText("Stop");
        stopButton.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        stopButton.setOnClickListener(v -> {
            Log.i(TAG, "stop button pressed");
            engine.stop();
        });
        root.addView(stopButton);

        statusView = new TextView(this);
        statusView.setText(LocalTtsEngine.State.UNINITIALIZED.name());
        statusView.setTextSize(18);
        statusView.setTextColor(Color.BLACK);
        statusView.setGravity(Gravity.CENTER_HORIZONTAL);
        statusView.setPadding(0, padding, 0, 0);
        root.addView(statusView);

        setContentView(root);

        engine = new KokoroLocalTtsEngine(getApplicationContext());
        engine.initialize(this);
    }

    @Override
    protected void onDestroy() {
        if (engine != null) {
            engine.shutdown();
        }
        super.onDestroy();
    }

    @Override
    public void onStateChanged(LocalTtsEngine.State state) {
        Log.i(TAG, "state=" + state.name());
        statusView.setText(state.name());
    }

    @Override
    public void onError(String message) {
        Log.e(TAG, "error: " + message);
        statusView.setText("ERROR: " + message);
    }

    @Override
    public void onAudioMeasured(long generationMs, long audioDurationMs) {
        Log.i(TAG, "measurement: audioDurationMs=" + audioDurationMs);
    }
}
