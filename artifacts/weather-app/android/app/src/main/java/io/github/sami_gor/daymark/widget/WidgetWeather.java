package io.github.sami_gor.daymark.widget;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Cached weather values used by the widget. Null fields mean unavailable. */
public final class WidgetWeather {
    public String placeName;
    public long fetchedAt;
    public String currentTime;
    public Double temperatureC;
    public Double feelsLikeC;
    public Double humidity;
    public Double windKmh;
    public Double windDirectionDegrees;
    public Double rainProbability;
    public Double rainfallMm;
    public Double uvIndex;
    public Double aqi;
    public Double pressureHpa;
    public Double visibilityKm;
    public Integer weatherCode;
    public String sunrise;
    public String sunset;
    public final List<Hourly> hourly = new ArrayList<>();

    public static final class Hourly {
        public String time;
        public Double temperatureC;
        public Double precipitationProbability;
    }

    public JSONObject toJson() throws JSONException {
        JSONObject root = new JSONObject();
        root.put("placeName", placeName == null ? JSONObject.NULL : placeName);
        root.put("fetchedAt", fetchedAt);
        root.put("currentTime", currentTime == null ? JSONObject.NULL : currentTime);
        putNullable(root, "temperatureC", temperatureC);
        putNullable(root, "feelsLikeC", feelsLikeC);
        putNullable(root, "humidity", humidity);
        putNullable(root, "windKmh", windKmh);
        putNullable(root, "windDirectionDegrees", windDirectionDegrees);
        putNullable(root, "rainProbability", rainProbability);
        putNullable(root, "rainfallMm", rainfallMm);
        putNullable(root, "uvIndex", uvIndex);
        putNullable(root, "aqi", aqi);
        putNullable(root, "pressureHpa", pressureHpa);
        putNullable(root, "visibilityKm", visibilityKm);
        root.put("weatherCode", weatherCode == null ? JSONObject.NULL : weatherCode);
        root.put("sunrise", sunrise == null ? JSONObject.NULL : sunrise);
        root.put("sunset", sunset == null ? JSONObject.NULL : sunset);
        JSONArray hours = new JSONArray();
        for (Hourly hour : hourly) {
            JSONObject item = new JSONObject();
            item.put("time", hour.time == null ? JSONObject.NULL : hour.time);
            putNullable(item, "temperatureC", hour.temperatureC);
            putNullable(item, "precipitationProbability", hour.precipitationProbability);
            hours.put(item);
        }
        root.put("hourly", hours);
        return root;
    }

    public static WidgetWeather fromJson(String raw) {
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        try {
            JSONObject root = new JSONObject(raw);
            WidgetWeather weather = new WidgetWeather();
            weather.placeName = nullableString(root, "placeName");
            weather.fetchedAt = root.optLong("fetchedAt", 0L);
            weather.currentTime = nullableString(root, "currentTime");
            weather.temperatureC = nullableDouble(root, "temperatureC");
            weather.feelsLikeC = nullableDouble(root, "feelsLikeC");
            weather.humidity = nullableDouble(root, "humidity");
            weather.windKmh = nullableDouble(root, "windKmh");
            weather.windDirectionDegrees = nullableDouble(root, "windDirectionDegrees");
            weather.rainProbability = nullableDouble(root, "rainProbability");
            weather.rainfallMm = nullableDouble(root, "rainfallMm");
            weather.uvIndex = nullableDouble(root, "uvIndex");
            weather.aqi = nullableDouble(root, "aqi");
            weather.pressureHpa = nullableDouble(root, "pressureHpa");
            weather.visibilityKm = nullableDouble(root, "visibilityKm");
            weather.weatherCode = root.has("weatherCode") && !root.isNull("weatherCode")
                    ? root.optInt("weatherCode") : null;
            weather.sunrise = nullableString(root, "sunrise");
            weather.sunset = nullableString(root, "sunset");
            JSONArray hours = root.optJSONArray("hourly");
            if (hours != null) {
                for (int index = 0; index < hours.length(); index++) {
                    JSONObject item = hours.optJSONObject(index);
                    if (item == null) {
                        continue;
                    }
                    Hourly hour = new Hourly();
                    hour.time = nullableString(item, "time");
                    hour.temperatureC = nullableDouble(item, "temperatureC");
                    hour.precipitationProbability = nullableDouble(item, "precipitationProbability");
                    weather.hourly.add(hour);
                }
            }
            return weather;
        } catch (JSONException ignored) {
            return null;
        }
    }

    private static void putNullable(JSONObject object, String key, Double value) throws JSONException {
        object.put(key, value == null ? JSONObject.NULL : value);
    }

    private static Double nullableDouble(JSONObject object, String key) {
        return object.has(key) && !object.isNull(key) ? object.optDouble(key) : null;
    }

    private static String nullableString(JSONObject object, String key) {
        return object.has(key) && !object.isNull(key) ? object.optString(key) : null;
    }
}
