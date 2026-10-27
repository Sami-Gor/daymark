package io.github.sami_gor.daymark.widget;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Statistics a widget instance can display, in stable preference-key form. */
public enum WidgetStat {
    TEMPERATURE("temperature", "Temperature"),
    FEELS_LIKE("feels_like", "Feels"),
    HUMIDITY("humidity", "Humidity"),
    WIND("wind", "Wind"),
    RAIN_PROBABILITY("rain_probability", "Rain"),
    HOURLY("hourly", "Hourly forecast"),
    RAINFALL("rainfall", "Rainfall"),
    UV_INDEX("uv_index", "UV"),
    AIR_QUALITY("air_quality", "Air"),
    PRESSURE("pressure", "Pressure"),
    VISIBILITY("visibility", "Visibility"),
    SUN("sun", "Sunrise/set");

    private final String key;
    private final String label;

    WidgetStat(String key, String label) {
        this.key = key;
        this.label = label;
    }

    public String key() {
        return key;
    }

    public String label() {
        return label;
    }

    /** Sensible initial selection; every statistic remains available in configuration. */
    public static List<WidgetStat> defaults() {
        return Collections.unmodifiableList(Arrays.asList(
                TEMPERATURE, FEELS_LIKE, HUMIDITY, WIND, RAIN_PROBABILITY,
                HOURLY, UV_INDEX, SUN));
    }

    public static List<WidgetStat> parse(String serialized) {
        if (serialized == null) {
            return new ArrayList<>(defaults());
        }
        List<WidgetStat> result = new ArrayList<>();
        for (String token : serialized.split(",")) {
            String value = token.trim();
            if (value.isEmpty()) {
                continue;
            }
            for (WidgetStat stat : values()) {
                if (stat.key.equals(value) && !result.contains(stat)) {
                    result.add(stat);
                    break;
                }
            }
        }
        return result;
    }

    public static String serialize(List<WidgetStat> stats) {
        StringBuilder builder = new StringBuilder();
        for (WidgetStat stat : stats) {
            if (stat == null || builder.indexOf(stat.key) >= 0) {
                continue;
            }
            if (builder.length() > 0) {
                builder.append(',');
            }
            builder.append(stat.key);
        }
        return builder.toString();
    }
}
