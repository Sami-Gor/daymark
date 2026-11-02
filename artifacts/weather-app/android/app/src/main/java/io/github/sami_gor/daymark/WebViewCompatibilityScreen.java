package io.github.sami_gor.daymark;

import android.app.Activity;
import android.graphics.Color;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.webkit.WebViewCompat;

import java.io.IOException;
import java.io.InputStream;

/**
 * Native fallback screen for devices whose Android System WebView is too old
 * to run the Daymark bundle. Shown instead of a blank WebView so the user gets
 * an actionable, readable message.
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
        show(activity, R.string.webview_required_title, R.string.webview_required_message, null);
    }

    public static void showMissingAssets(Activity activity) {
        show(activity, R.string.webview_assets_missing_title, R.string.webview_assets_missing_message, null);
    }

    /** Native recovery for a local chunk/application asset failure after bridge start. */
    public static void showRecovery(Activity activity, Runnable retry) {
        show(activity, R.string.webview_recovery_title, R.string.webview_recovery_message, retry);
    }

    private static void show(Activity activity, int titleRes, int messageRes, Runnable retry) {
        float density = activity.getResources().getDisplayMetrics().density;
        int padding = (int) (24 * density);

        LinearLayout layout = new LinearLayout(activity);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(padding, padding, padding, padding);
        layout.setBackgroundColor(Color.WHITE);

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
        activity.setContentView(layout);
    }
}
