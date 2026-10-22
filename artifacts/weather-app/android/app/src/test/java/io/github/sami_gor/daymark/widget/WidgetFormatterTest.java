package io.github.sami_gor.daymark.widget;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class WidgetFormatterTest {
    @Test
    public void formatsTemperatureAndWindInBothUnits() {
        assertEquals("9°", WidgetFormatter.temperature(9.2, WidgetPreferences.UNIT_CELSIUS));
        assertEquals("49°", WidgetFormatter.temperature(9.2, WidgetPreferences.UNIT_FAHRENHEIT));
        assertEquals("12 km/h NW", WidgetFormatter.wind(12.4, 315.0, WidgetPreferences.UNIT_CELSIUS));
        assertEquals("8 mph NW", WidgetFormatter.wind(12.4, 315.0, WidgetPreferences.UNIT_FAHRENHEIT));
    }

    @Test
    public void formatsRainUvAqiAndPressure() {
        assertEquals("100%", WidgetFormatter.percent(99.6));
        assertEquals("0.0 mm", WidgetFormatter.rainfall(0.02));
        assertEquals("0.9", WidgetFormatter.uv(0.9));
        assertEquals("32 Good", WidgetFormatter.aqi(32.0));
        assertEquals("1012 hPa", WidgetFormatter.pressure(1012.4));
    }

    @Test
    public void formatsVisibilityAndSunTimes() {
        assertEquals("10 km", WidgetFormatter.visibility(10.2));
        assertEquals("1.5 km", WidgetFormatter.visibility(1.5));
        assertEquals("07:34 / 17:54", WidgetFormatter.sun(
                "2026-10-22T07:34", "2026-10-22T17:54"));
        assertEquals("07:34", WidgetFormatter.hourlyTime("2026-10-22T07:34"));
    }

    @Test
    public void unavailableValuesUseDashAndUnknownCodeIsGeneric() {
        assertEquals("—", WidgetFormatter.temperature(null, WidgetPreferences.UNIT_CELSIUS));
        assertEquals("—", WidgetFormatter.percent(null));
        assertEquals("—", WidgetFormatter.sun(null, null));
        assertEquals("Weather", WidgetFormatter.condition(999));
        assertEquals("Rain", WidgetFormatter.condition(63));
    }
}
