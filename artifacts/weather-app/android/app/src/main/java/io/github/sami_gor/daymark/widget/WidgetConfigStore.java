package io.github.sami_gor.daymark.widget;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.List;

/** Per-widget-instance statistic configuration. */
public final class WidgetConfigStore {
    private static final String PREFS = "daymark_widgets";
    private static final String KEY_PREFIX = "stats_";

    private WidgetConfigStore() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static List<WidgetStat> getStats(Context context, int appWidgetId) {
        SharedPreferences preferences = prefs(context);
        String key = KEY_PREFIX + appWidgetId;
        if (!preferences.contains(key)) {
            return new ArrayList<>(WidgetStat.defaults());
        }
        return WidgetStat.parse(preferences.getString(key, ""));
    }

    public static void setStats(Context context, int appWidgetId, List<WidgetStat> stats) {
        prefs(context).edit()
                .putString(KEY_PREFIX + appWidgetId, WidgetStat.serialize(stats))
                .apply();
    }

    public static void delete(Context context, int appWidgetId) {
        prefs(context).edit().remove(KEY_PREFIX + appWidgetId).apply();
    }
}
