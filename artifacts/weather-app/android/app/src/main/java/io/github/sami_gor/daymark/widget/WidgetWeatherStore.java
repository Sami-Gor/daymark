package io.github.sami_gor.daymark.widget;

import android.content.Context;
import android.content.SharedPreferences;

/** Last successful widget fetch; used for offline and immediate updates. */
public final class WidgetWeatherStore {
    private static final String PREFS = "daymark_widget_data";
    private static final String KEY = "weather";

    private WidgetWeatherStore() {
    }

    public static WidgetWeather load(Context context) {
        SharedPreferences preferences =
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return WidgetWeather.fromJson(preferences.getString(KEY, null));
    }

    public static void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    public static void save(Context context, WidgetWeather weather) {
        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY, weather.toJson().toString())
                    .apply();
        } catch (Exception ignored) {
            // Keep the previous cache if serialization fails.
        }
    }
}
