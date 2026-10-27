package io.github.sami_gor.daymark.widget;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives the app's unit and coarse-location preference for the native widget. */
@CapacitorPlugin(name = "WidgetSync")
public final class WidgetSyncPlugin extends Plugin {
    @PluginMethod
    public void sync(PluginCall call) {
        JSObject data = call.getData();
        String unit = data.optString("unit", WidgetPreferences.UNIT_CELSIUS);
        Double latitude = data.has("latitude") && !data.isNull("latitude")
                ? data.optDouble("latitude") : null;
        Double longitude = data.has("longitude") && !data.isNull("longitude")
                ? data.optDouble("longitude") : null;
        String placeName = data.optString("placeName", "London");
        // Do not persist a location preference or schedule background work for
        // users who have not placed a widget.
        if (!WidgetScheduler.hasWidgets(getContext())) {
            call.resolve();
            return;
        }
        WidgetPreferences.setFromSync(getContext(), unit, latitude, longitude, placeName);
        WidgetScheduler.ensurePeriodic(getContext());
        WidgetScheduler.requestImmediate(getContext());
        call.resolve();
    }
}
