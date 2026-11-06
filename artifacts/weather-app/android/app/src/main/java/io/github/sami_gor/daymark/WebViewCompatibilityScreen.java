package io.github.sami_gor.daymark;

import android.app.Activity;
import android.graphics.Color;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.webkit.WebViewCompat;

import java.io.IOException;
import java.io.InputStream;

/**
 * Native fallback screen for devices whose Android System WebView is too old
 * to run the Daymark bundle, and for post-bridge recovery. Both cases show an
 * actionable, readable message instead of a blank WebView.
 */
public final class WebViewCompatibilityScreen {

    private WebViewCompatibilityScreen() {
    }

    /** @return the installed WebView major version, or null when unavailable. */
    public static Integer installedWebViewMajor(Activity activity) {
        try {
            android.content.pm.PackageInfo packageInfo = WebViewCompat.getCurrentWebViewPackage(activity);
            return WebViewCompatibility.parseMajorVersion(packageInfo != null ? packageInfo.versionName : null);
        } catch (Throwable failure) {
            return null;
        }
    }

    public static boolean isCurrentWebViewSupported(Activity activity) {
        return WebViewCompatibility.isSupported(installedWebViewMajor(activity));
    }

    /** Whether the packaged web entry point exists before Capacitor starts. */
    public static boolean hasRequiredAssets(Activity activity) {
        try (InputStream input = activity.getAssets().open("public/index.html")) {
            return input.read() != -1;
        } catch (IOException missing) {
            return false;
        }
    }

    public static void show(Activity activity) {
        activity.setContentView(createScreen(
                activity, R.string.webview_required_title, R.string.webview_required_message, null));
    }

    public static void showMissingAssets(Activity activity) {
        activity.setContentView(createScreen(
                activity, R.string.webview_assets_missing_title, R.string.webview_assets_missing_message, null));
    }

    /**
     * Native recovery for a local chunk/application asset failure after bridge
     * start. The screen is layered over Capacitor's live root instead of
     * replacing the content view, so retrying can reload the existing WebView
     * without detaching it from its original parent.
     */
    public static View showRecovery(Activity activity, Runnable retry) {
        return showOverlay(activity, createScreen(
                activity, R.string.webview_recovery_title, R.string.webview_recovery_message, retry));
    }

    /** Terminal asset-recovery guidance: no reload action is offered. */
    public static View showRecoveryTerminal(Activity activity) {
        return showOverlay(activity, createScreen(
                activity,
                R.string.webview_recovery_terminal_title,
                R.string.webview_recovery_terminal_message,
                null));
    }

    /**
     * Terminal renderer-failure guidance. A terminated renderer cannot be
     * reloaded; the app replaces the WebView once, and this screen is the
     * bounded fallback when that replacement also fails.
     */
    public static View showRendererUnavailable(Activity activity) {
        return showOverlay(activity, createScreen(
                activity,
                R.string.webview_renderer_title,
                R.string.webview_renderer_message,
                null));
    }

    private static View showOverlay(Activity activity, View screen) {
        ViewGroup content = activity.findViewById(android.R.id.content);
        if (content == null) {
            activity.setContentView(screen);
            return screen;
        }
        content.addView(screen, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return screen;
    }

    private static View createScreen(
            Activity activity, int titleRes, int messageRes, Runnable retry) {
        float density = activity.getResources().getDisplayMetrics().density;
        int padding = (int) (24 * density);

        LinearLayout layout = new LinearLayout(activity);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(padding, padding, padding, padding);
        layout.setBackgroundColor(Color.WHITE);
        // The overlay sits above the WebView; consume input so taps cannot
        // reach the live page behind it.
        layout.setClickable(true);
        layout.setFocusable(true);

        TextView title = new TextView(activity);
        title.setText(titleRes);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setTextColor(Color.rgb(0x16, 0x2b, 0x38));
        title.setGravity(Gravity.CENTER);

        TextView message = new TextView(activity);
        message.setText(messageRes);
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        message.setTextColor(Color.rgb(0x3d, 0x52, 0x5e));
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        messageParams.topMargin = (int) (16 * density);
        message.setLayoutParams(messageParams);

        layout.addView(title);
        layout.addView(message);
        if (retry != null) {
            Button reload = new Button(activity);
            reload.setText(R.string.webview_recovery_reload);
            reload.setAllCaps(false);
            LinearLayout.LayoutParams reloadParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            reloadParams.topMargin = (int) (20 * density);
            reload.setLayoutParams(reloadParams);
            reload.setOnClickListener(view -> retry.run());
            layout.addView(reload);
        }
        return layout;
    }
}
