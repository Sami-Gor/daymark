package io.github.sami_gor.daymark.widget;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Pure formatting rules shared by widget views and JVM tests. */
public final class WidgetFormatter {
    private WidgetFormatter() {
    }

    public static String temperature(Double celsius, String unit) {
        if (celsius == null || !Double.isFinite(celsius)) {
            return "—";
        }
        double value = isFahrenheit(unit) ? celsius * 9d / 5d + 32d : celsius;
        return Math.round(value) + "°";
    }

    public static String wind(Double speedKmh, Double directionDegrees, String unit) {
        if (speedKmh == null || !Double.isFinite(speedKmh)) {
            return "—";
        }
        double speed = isFahrenheit(unit) ? speedKmh * 0.621371d : speedKmh;
        String suffix = isFahrenheit(unit) ? " mph" : " km/h";
        String direction = compass(directionDegrees);
        return Math.round(speed) + suffix + (direction.isEmpty() ? "" : " " + direction);
    }

    public static String percent(Double value) {
        if (value == null || !Double.isFinite(value)) {
            return "—";
        }
        return Math.round(value) + "%";
    }

    public static String rainfall(Double millimetres) {
        if (millimetres == null || !Double.isFinite(millimetres)) {
            return "—";
        }
        return String.format(Locale.US, "%.1f mm", millimetres);
    }

    public static String uv(Double value) {
        if (value == null || !Double.isFinite(value)) {
            return "—";
        }
        return String.format(Locale.US, "%.1f", value);
    }

    public static String aqi(Double value) {
        if (value == null || !Double.isFinite(value)) {
            return "—";
        }
        int rounded = (int) Math.round(value);
        return rounded + " " + aqiLabel(rounded);
    }

    public static String pressure(Double hpa) {
        if (hpa == null || !Double.isFinite(hpa)) {
            return "—";
        }
        return Math.round(hpa) + " hPa";
    }

    public static String visibility(Double kilometres) {
        if (kilometres == null || !Double.isFinite(kilometres)) {
            return "—";
        }
        if (kilometres >= 10d) {
            return Math.round(kilometres) + " km";
        }
        return String.format(Locale.US, "%.1f km", kilometres);
    }

    public static String sun(String sunrise, String sunset) {
        String rise = clock(sunrise);
        String set = clock(sunset);
        if (rise == null && set == null) {
            return "—";
        }
        return (rise == null ? "—" : rise) + " / " + (set == null ? "—" : set);
    }

    public static String hourlyTime(String apiTime) {
        String value = clock(apiTime);
        return value == null ? "—" : value;
    }

    public static String condition(Integer code) {
        if (code == null) {
            return "Weather unavailable";
        }
        switch (code) {
            case 0: return "Clear";
            case 1: return "Mainly clear";
            case 2: return "Partly cloudy";
            case 3: return "Overcast";
            case 45:
            case 48: return "Fog";
            case 51: return "Light drizzle";
            case 53: return "Drizzle";
            case 55: return "Heavy drizzle";
            case 56:
            case 57: return "Freezing drizzle";
            case 61: return "Light rain";
            case 63: return "Rain";
            case 65: return "Heavy rain";
            case 66:
            case 67: return "Freezing rain";
            case 71: return "Light snow";
            case 73: return "Snow";
            case 75: return "Heavy snow";
            case 77: return "Snow grains";
            case 80: return "Light showers";
            case 81: return "Showers";
            case 82: return "Heavy showers";
            case 85: return "Snow showers";
            case 86: return "Heavy snow showers";
            case 95: return "Thunderstorm";
            case 96:
            case 99: return "Thunderstorm with hail";
            default: return "Weather";
        }
    }

    public static String updated(long fetchedAt) {
        if (fetchedAt <= 0L) {
            return "No weather data";
        }
        return new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(fetchedAt));
    }

    private static boolean isFahrenheit(String unit) {
        return WidgetPreferences.UNIT_FAHRENHEIT.equals(unit);
    }

    private static String compass(Double degrees) {
        if (degrees == null || !Double.isFinite(degrees)) {
            return "";
        }
        String[] points = {"N", "NE", "E", "SE", "S", "SW", "W", "NW"};
        int index = (int) Math.round(((degrees % 360d) + 360d) % 360d / 45d) % 8;
        return points[index];
    }

    private static String clock(String apiTime) {
        if (apiTime == null || apiTime.length() < 16) {
            return null;
        }
        int separator = apiTime.indexOf('T');
        if (separator < 0 || apiTime.length() < separator + 6) {
            return null;
        }
        return apiTime.substring(separator + 1, separator + 6);
    }

    private static String aqiLabel(int aqi) {
        if (aqi <= 50) return "Good";
        if (aqi <= 100) return "Moderate";
        if (aqi <= 150) return "Sensitive";
        if (aqi <= 200) return "Unhealthy";
        if (aqi <= 300) return "Very unhealthy";
        return "Hazardous";
    }
}
