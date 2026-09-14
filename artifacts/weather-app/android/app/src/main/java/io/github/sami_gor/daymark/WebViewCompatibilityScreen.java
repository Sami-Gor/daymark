package io.github.sami_gor.daymark;

import android.app.Activity;
import android.graphics.Color;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.webkit.WebViewCompat;

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

    public static void show(Activity activity) {
        float density = activity.getResources().getDisplayMetrics().density;
        int padding = (int) (24 * density);

        LinearLayout layout = new LinearLayout(activity);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(padding, padding, padding, padding);
        layout.setBackgroundColor(Color.WHITE);

        TextView title = new TextView(activity);
        title.setText(R.string.webview_required_title);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setTextColor(Color.rgb(0x16, 0x2b, 0x38));
        title.setGravity(Gravity.CENTER);

        TextView message = new TextView(activity);
        message.setText(R.string.webview_required_message);
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        message.setTextColor(Color.rgb(0x3d, 0x52, 0x5e));
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        messageParams.topMargin = (int) (16 * density);
        message.setLayoutParams(messageParams);

        layout.addView(title);
        layout.addView(message);
        activity.setContentView(layout);
    }
}
