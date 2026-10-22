package io.github.sami_gor.daymark.widget;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Small Open-Meteo client for the widget; no new weather provider is introduced. */
public final class WidgetWeatherClient {
    private static final String FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
    private static final String AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

    private WidgetWeatherClient() {
    }

    public static WidgetWeather fetch(Context context) throws IOException {
        double latitude = WidgetPreferences.latitude(context);
        double longitude = WidgetPreferences.longitude(context);
        String place = WidgetPreferences.placeName(context);

        String forecastUrl = String.format(Locale.US,
                "%s?latitude=%s&longitude=%s&current="
                        + "temperature_2m,apparent_temperature,relative_humidity_2m,"
                        + "precipitation,weather_code,wind_speed_10m,wind_direction_10m,"
                        + "pressure_msl,uv_index"
                        + "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,visibility"
                        + "&daily=sunrise,sunset&forecast_days=2&timezone=auto",
                FORECAST_URL, latitude, longitude);
        JSONObject forecast = fetchJson(forecastUrl);
        JSONObject current = forecast.optJSONObject("current");
        if (current == null) {
            throw new IOException("forecast missing current weather");
        }

        JSONObject hourly = forecast.optJSONObject("hourly");
        JSONObject daily = forecast.optJSONObject("daily");
        String currentTime = current.optString("time", "");
        int index = hourIndex(hourly, currentTime);

        WidgetWeather weather = new WidgetWeather();
        weather.placeName = place;
        weather.fetchedAt = System.currentTimeMillis();
        weather.currentTime = currentTime;
        weather.temperatureC = number(current, "temperature_2m");
        weather.feelsLikeC = number(current, "apparent_temperature");
        weather.humidity = number(current, "relative_humidity_2m");
        weather.windKmh = number(current, "wind_speed_10m");
        weather.windDirectionDegrees = number(current, "wind_direction_10m");
        weather.pressureHpa = number(current, "pressure_msl");
        weather.uvIndex = number(current, "uv_index");
        weather.weatherCode = integer(current, "weather_code");
        weather.rainfallMm = number(current, "precipitation");
        if (weather.rainfallMm == null) {
            weather.rainfallMm = hourlyNumber(hourly, "precipitation", index);
        }
        weather.rainProbability = hourlyNumber(hourly, "precipitation_probability", index);
        Double visibilityMetres = hourlyNumber(hourly, "visibility", index);
        weather.visibilityKm = visibilityMetres == null ? null : visibilityMetres / 1000d;
        weather.sunrise = dailyString(daily, "sunrise", 0);
        weather.sunset = dailyString(daily, "sunset", 0);

        if (hourly != null) {
            JSONArray times = hourly.optJSONArray("time");
            JSONArray temperatures = hourly.optJSONArray("temperature_2m");
            JSONArray probabilities = hourly.optJSONArray("precipitation_probability");
            if (times != null) {
                for (int offset = 0; offset < 4 && index + offset < times.length(); offset++) {
                    int hour = index + offset;
                    WidgetWeather.Hourly item = new WidgetWeather.Hourly();
                    item.time = times.optString(hour, null);
                    item.temperatureC = arrayNumber(temperatures, hour);
                    item.precipitationProbability = arrayNumber(probabilities, hour);
                    weather.hourly.add(item);
                }
            }
        }

        try {
            String airUrl = String.format(Locale.US,
                    "%s?latitude=%s&longitude=%s&current=us_aqi&timezone=auto",
                    AIR_QUALITY_URL, latitude, longitude);
            JSONObject air = fetchJson(airUrl);
            JSONObject airCurrent = air.optJSONObject("current");
            weather.aqi = airCurrent == null ? null : number(airCurrent, "us_aqi");
        } catch (Exception ignored) {
            // Air quality is optional; forecast remains usable when it fails.
        }
        return weather;
    }

    private static JSONObject fetchJson(String address) throws IOException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setInstanceFollowRedirects(true);
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new IOException("weather request failed: " + code);
            }
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
            } catch (Exception error) {
                if (error instanceof IOException) {
                    throw (IOException) error;
                }
                throw new IOException("weather response was not valid JSON", error);
            }
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static int hourIndex(JSONObject hourly, String currentTime) {
        if (hourly == null) {
            return 0;
        }
        JSONArray times = hourly.optJSONArray("time");
        if (times == null || times.length() == 0) {
            return 0;
        }
        int fallback = 0;
        for (int index = 0; index < times.length(); index++) {
            String value = times.optString(index, "");
            if (value.equals(currentTime)) {
                return index;
            }
            if (!currentTime.isEmpty() && value.compareTo(currentTime) <= 0) {
                fallback = index;
            }
        }
        return fallback;
    }

    private static Double hourlyNumber(JSONObject hourly, String key, int index) {
        if (hourly == null) {
            return null;
        }
        return arrayNumber(hourly.optJSONArray(key), index);
    }

    private static Double arrayNumber(JSONArray array, int index) {
        if (array == null || index < 0 || index >= array.length() || array.isNull(index)) {
            return null;
        }
        double value = array.optDouble(index, Double.NaN);
        return Double.isFinite(value) ? value : null;
    }

    private static Double number(JSONObject object, String key) {
        if (object == null || !object.has(key) || object.isNull(key)) {
            return null;
        }
        double value = object.optDouble(key, Double.NaN);
        return Double.isFinite(value) ? value : null;
    }

    private static Integer integer(JSONObject object, String key) {
        if (object == null || !object.has(key) || object.isNull(key)) {
            return null;
        }
        return object.optInt(key);
    }

    private static String dailyString(JSONObject daily, String key, int index) {
        if (daily == null) {
            return null;
        }
        JSONArray values = daily.optJSONArray(key);
        if (values == null || index >= values.length() || values.isNull(index)) {
            return null;
        }
        return values.optString(index, null);
    }
}
