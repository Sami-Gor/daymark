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

/**
 * Native recovery UI for WebView renderer loss.
 *
 * <p>Shown instead of a blank/frozen WebView so the user always gets explicit
 * feedback ("no false healthy state"): a transient "Restoring Daymark" screen
 * while the WebView is recreated, or a terminal "Try again" screen once the
 * bounded automatic recovery budget is spent. Strings are localized through the
 * normal Android resources (values-fr / values-es).
 */
public final class WebViewRecoveryScreen {

    private WebViewRecoveryScreen() {
    }

    /** Progress feedback shown while the Activity/WebView is being rebuilt. */
    public static void showRecovering(Activity activity) {
        show(activity,
                R.string.webview_recovery_restoring_title,
                R.string.webview_recovery_restoring_message,
                0,
                null);
    }

    /** Terminal fallback after the automatic budget is exhausted; offers one manual retry. */
    public static void showTerminal(Activity activity, Runnable onRetry) {
        show(activity,
                R.string.webview_recovery_title,
                R.string.webview_recovery_message,
                R.string.webview_recovery_retry,
                onRetry);
    }

    private static void show(
            Activity activity,
            int titleResource,
            int messageResource,
            int buttonResource,
            final Runnable onRetry) {
        if (activity == null) {
            return;
        }
        float density = activity.getResources().getDisplayMetrics().density;
        int padding = (int) (24 * density);

        LinearLayout layout = new LinearLayout(activity);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(padding, padding, padding, padding);
        layout.setBackgroundColor(Color.WHITE);

        TextView title = new TextView(activity);
        title.setText(titleResource);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setTextColor(Color.rgb(0x16, 0x2b, 0x38));
        title.setGravity(Gravity.CENTER);

        TextView message = new TextView(activity);
        message.setText(messageResource);
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        message.setTextColor(Color.rgb(0x3d, 0x52, 0x5e));
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        messageParams.topMargin = (int) (16 * density);
        message.setLayoutParams(messageParams);

        layout.addView(title);
        layout.addView(message);

        if (buttonResource != 0 && onRetry != null) {
            Button retry = new Button(activity);
            retry.setText(buttonResource);
            retry.setAllCaps(false);
            LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            buttonParams.topMargin = (int) (16 * density);
            retry.setLayoutParams(buttonParams);
            retry.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    onRetry.run();
                }
            });
            layout.addView(retry);
        }

        activity.setContentView(layout);
    }
}
