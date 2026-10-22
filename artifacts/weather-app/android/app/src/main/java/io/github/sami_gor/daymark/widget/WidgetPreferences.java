package io.github.sami_gor.daymark.widget;

import android.content.Context;
import android.content.SharedPreferences;

/** Preferences shared between the Capacitor app and the native widget. */
public final class WidgetPreferences {
    private static final String PREFS = "daymark_widget_preferences";
    private static final String KEY_UNIT = "unit";
    private static final String KEY_LATITUDE = "latitude";
    private static final String KEY_LONGITUDE = "longitude";
    private static final String KEY_PLACE = "place";

    public static final String UNIT_CELSIUS = "celsius";
    public static final String UNIT_FAHRENHEIT = "fahrenheit";

    private static final double DEFAULT_LATITUDE = 51.5074;
    private static final double DEFAULT_LONGITUDE = -0.1278;
    private static final String DEFAULT_PLACE = "London";

    private WidgetPreferences() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String unit(Context context) {
        return prefs(context).getString(KEY_UNIT, UNIT_CELSIUS);
    }

    public static double latitude(Context context) {
        return prefs(context).getFloat(KEY_LATITUDE, (float) DEFAULT_LATITUDE);
    }

    public static double longitude(Context context) {
        return prefs(context).getFloat(KEY_LONGITUDE, (float) DEFAULT_LONGITUDE);
    }

    public static String placeName(Context context) {
        return prefs(context).getString(KEY_PLACE, DEFAULT_PLACE);
    }

    public static void clear(Context context) {
        prefs(context).edit().clear().apply();
    }

    public static void setFromSync(
            Context context, String unit, Double latitude, Double longitude, String placeName) {
        String normalizedUnit = UNIT_FAHRENHEIT.equals(unit)
                ? UNIT_FAHRENHEIT : UNIT_CELSIUS;
        double lat = latitude != null && Double.isFinite(latitude)
                ? latitude : DEFAULT_LATITUDE;
        double lon = longitude != null && Double.isFinite(longitude)
                ? longitude : DEFAULT_LONGITUDE;
        String place = placeName != null && !placeName.trim().isEmpty()
                ? placeName.trim() : DEFAULT_PLACE;
        prefs(context).edit()
                .putString(KEY_UNIT, normalizedUnit)
                .putFloat(KEY_LATITUDE, (float) lat)
                .putFloat(KEY_LONGITUDE, (float) lon)
                .putString(KEY_PLACE, place)
                .apply();
    }
}
