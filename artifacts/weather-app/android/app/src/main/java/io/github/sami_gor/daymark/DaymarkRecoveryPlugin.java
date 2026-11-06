package io.github.sami_gor.daymark;

import android.app.Activity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Narrow bridge used by the web bundle to report a local script/CSS/chunk
 * failure after Capacitor has started. It carries no user data, URL or stack.
 */
@CapacitorPlugin(name = "DaymarkRecovery")
public class DaymarkRecoveryPlugin extends Plugin {

    @PluginMethod
    public void reportAssetFailure(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            ((MainActivity) activity).onLocalApplicationAssetFailure();
        }
        call.resolve();
    }
}
