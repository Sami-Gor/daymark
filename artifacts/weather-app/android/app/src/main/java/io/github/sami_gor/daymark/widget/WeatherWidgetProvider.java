package io.github.sami_gor.daymark.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import io.github.sami_gor.daymark.MainActivity;
import io.github.sami_gor.daymark.R;

import java.util.ArrayList;
import java.util.List;

/** Resizable, per-instance native home-screen weather widget. */
public final class WeatherWidgetProvider extends AppWidgetProvider {
    private static final int[] ROW_IDS = {
            R.id.widget_stat_row_0,
            R.id.widget_stat_row_1,
            R.id.widget_stat_row_2,
            R.id.widget_stat_row_3,
            R.id.widget_stat_row_4,
            R.id.widget_stat_row_5,
    };
    private static final int[] CELL_IDS = {
            R.id.widget_stat_cell_0, R.id.widget_stat_cell_1,
            R.id.widget_stat_cell_2, R.id.widget_stat_cell_3,
            R.id.widget_stat_cell_4, R.id.widget_stat_cell_5,
            R.id.widget_stat_cell_6, R.id.widget_stat_cell_7,
            R.id.widget_stat_cell_8, R.id.widget_stat_cell_9,
            R.id.widget_stat_cell_10, R.id.widget_stat_cell_11,
    };
    private static final int[] LABEL_IDS = {
            R.id.widget_stat_label_0, R.id.widget_stat_label_1,
            R.id.widget_stat_label_2, R.id.widget_stat_label_3,
            R.id.widget_stat_label_4, R.id.widget_stat_label_5,
            R.id.widget_stat_label_6, R.id.widget_stat_label_7,
            R.id.widget_stat_label_8, R.id.widget_stat_label_9,
            R.id.widget_stat_label_10, R.id.widget_stat_label_11,
    };
    private static final int[] VALUE_IDS = {
            R.id.widget_stat_value_0, R.id.widget_stat_value_1,
            R.id.widget_stat_value_2, R.id.widget_stat_value_3,
            R.id.widget_stat_value_4, R.id.widget_stat_value_5,
            R.id.widget_stat_value_6, R.id.widget_stat_value_7,
            R.id.widget_stat_value_8, R.id.widget_stat_value_9,
            R.id.widget_stat_value_10, R.id.widget_stat_value_11,
    };
    private static final int[] HOURLY_TIME_IDS = {
            R.id.widget_hourly_0_time, R.id.widget_hourly_1_time,
            R.id.widget_hourly_2_time, R.id.widget_hourly_3_time,
    };
    private static final int[] HOURLY_TEMP_IDS = {
            R.id.widget_hourly_0_temp, R.id.widget_hourly_1_temp,
            R.id.widget_hourly_2_temp, R.id.widget_hourly_3_temp,
    };
    private static final int[] HOURLY_RAIN_IDS = {
            R.id.widget_hourly_0_rain, R.id.widget_hourly_1_rain,
            R.id.widget_hourly_2_rain, R.id.widget_hourly_3_rain,
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, manager, appWidgetId);
        }
        WidgetScheduler.ensurePeriodic(context);
        WidgetScheduler.requestImmediate(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(
            Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        updateWidget(context, manager, appWidgetId);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            WidgetConfigStore.delete(context, appWidgetId);
        }
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager.getAppWidgetIds(new ComponentName(context, WeatherWidgetProvider.class)).length == 0) {
            WidgetScheduler.cancel(context);
            WidgetWeatherStore.clear(context);
            WidgetPreferences.clear(context);
        }
    }

    @Override
    public void onEnabled(Context context) {
        WidgetScheduler.ensurePeriodic(context);
        WidgetScheduler.requestImmediate(context);
    }

    @Override
    public void onDisabled(Context context) {
        WidgetScheduler.cancel(context);
        WidgetWeatherStore.clear(context);
        WidgetPreferences.clear(context);
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, WeatherWidgetProvider.class));
        for (int id : ids) {
            updateWidget(context, manager, id);
        }
    }

    public static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        WidgetWeather weather = WidgetWeatherStore.load(context);
        String unit = WidgetPreferences.unit(context);
        List<WidgetStat> selected = WidgetConfigStore.getStats(context, appWidgetId);
        Bundle options = manager.getAppWidgetOptions(appWidgetId);
        int width = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        int capacity = capacity(width, height);
        boolean compact = capacity == 2;
        boolean narrow = width > 0 && width < 300;
        boolean showHourly = selected.contains(WidgetStat.HOURLY)
                && capacity > 2
                && (height == 0 || height >= 300);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_weather);
        int padding = compact ? 8 : 14;
        views.setViewPadding(R.id.widget_root, dp(padding), dp(padding), dp(padding), dp(padding));
        views.setTextViewTextSize(R.id.widget_temp,
                TypedValue.COMPLEX_UNIT_SP, compact ? 30 : 38);
        String placeName = weather != null && weather.placeName != null
                ? weather.placeName : WidgetPreferences.placeName(context);
        views.setTextViewText(R.id.widget_place, placeName);
        views.setTextViewText(R.id.widget_updated, updatedLabel(weather));
        views.setViewVisibility(R.id.widget_updated,
                compact || narrow ? View.GONE : View.VISIBLE);
        views.setTextViewText(R.id.widget_footer, context.getString(R.string.widget_footer));
        views.setViewVisibility(R.id.widget_footer,
                compact || narrow || (height > 0 && height < 300)
                        ? View.GONE : View.VISIBLE);

        boolean showCurrent = selected.contains(WidgetStat.TEMPERATURE) && weather != null;
        views.setViewVisibility(R.id.widget_current, showCurrent ? View.VISIBLE : View.GONE);
        if (showCurrent) {
            views.setTextViewText(R.id.widget_temp,
                    WidgetFormatter.temperature(weather.temperatureC, unit));
            views.setTextViewText(R.id.widget_condition,
                    WidgetFormatter.condition(weather.weatherCode));
            views.setViewVisibility(R.id.widget_condition, compact ? View.GONE : View.VISIBLE);
        }

        List<WidgetStat> cells = new ArrayList<>();
        for (WidgetStat stat : selected) {
            if (stat != WidgetStat.TEMPERATURE && stat != WidgetStat.HOURLY) {
                cells.add(stat);
            }
        }
        for (int index = 0; index < CELL_IDS.length; index++) {
            boolean visible = index < cells.size() && index < capacity;
            views.setViewVisibility(CELL_IDS[index], visible ? View.VISIBLE : View.GONE);
            if (visible) {
                WidgetStat stat = cells.get(index);
                views.setTextViewText(LABEL_IDS[index], stat.label());
                views.setTextViewText(VALUE_IDS[index], valueFor(stat, weather, unit));
            }
        }
        for (int row = 0; row < ROW_IDS.length; row++) {
            int first = row * 2;
            boolean visible = first < cells.size() && first < capacity;
            views.setViewVisibility(ROW_IDS[row], visible ? View.VISIBLE : View.GONE);
        }

        boolean hourlyVisible = showHourly && weather != null && !weather.hourly.isEmpty();
        views.setViewVisibility(R.id.widget_hourly, hourlyVisible ? View.VISIBLE : View.GONE);
        if (hourlyVisible) {
            int count = Math.min(4, weather.hourly.size());
            for (int index = 0; index < 4; index++) {
                boolean visible = index < count;
                views.setViewVisibility(HOURLY_TIME_IDS[index], visible ? View.VISIBLE : View.GONE);
                views.setViewVisibility(HOURLY_TEMP_IDS[index], visible ? View.VISIBLE : View.GONE);
                views.setViewVisibility(HOURLY_RAIN_IDS[index], visible ? View.VISIBLE : View.GONE);
                if (visible) {
                    WidgetWeather.Hourly hour = weather.hourly.get(index);
                    views.setTextViewText(HOURLY_TIME_IDS[index],
                            WidgetFormatter.hourlyTime(hour.time));
                    views.setTextViewText(HOURLY_TEMP_IDS[index],
                            WidgetFormatter.temperature(hour.temperatureC, unit));
                    views.setTextViewText(HOURLY_RAIN_IDS[index],
                            WidgetFormatter.percent(hour.precipitationProbability));
                }
            }
        }

        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context, appWidgetId, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);
        manager.updateAppWidget(appWidgetId, views);
    }

    private static int capacity(int width, int height) {
        // A 2x2 widget is roughly 184x184dp on the test launcher. A tall,
        // narrow widget should reveal more statistics even though its width
        // is still two cells.
        if (width > 0 && height > 0 && width < 220 && height < 220) {
            return 2;
        }
        if ((width > 0 && width < 340) || (height > 0 && height < 300)) {
            return 6;
        }
        if (height > 0 && height < 380) {
            return 8;
        }
        return 12;
    }

    private static int dp(int value) {
        return Math.round(value * android.content.res.Resources.getSystem().getDisplayMetrics().density);
    }

    private static String updatedLabel(WidgetWeather weather) {
        if (weather == null) {
            return "Loading weather…";
        }
        String time = WidgetFormatter.updated(weather.fetchedAt);
        if (System.currentTimeMillis() - weather.fetchedAt > 2L * 60L * 60L * 1000L) {
            return "Offline · " + time;
        }
        return "Updated " + time;
    }

    private static String valueFor(WidgetStat stat, WidgetWeather weather, String unit) {
        if (weather == null) {
            return "—";
        }
        switch (stat) {
            case FEELS_LIKE:
                return WidgetFormatter.temperature(weather.feelsLikeC, unit);
            case HUMIDITY:
                return WidgetFormatter.percent(weather.humidity);
            case WIND:
                return WidgetFormatter.wind(weather.windKmh, weather.windDirectionDegrees, unit);
            case RAIN_PROBABILITY:
                return WidgetFormatter.percent(weather.rainProbability);
            case RAINFALL:
                return WidgetFormatter.rainfall(weather.rainfallMm);
            case UV_INDEX:
                return WidgetFormatter.uv(weather.uvIndex);
            case AIR_QUALITY:
                return WidgetFormatter.aqi(weather.aqi);
            case PRESSURE:
                return WidgetFormatter.pressure(weather.pressureHpa);
            case VISIBILITY:
                return WidgetFormatter.visibility(weather.visibilityKm);
            case SUN:
                return WidgetFormatter.sun(weather.sunrise, weather.sunset);
            default:
                return "—";
        }
    }
}
