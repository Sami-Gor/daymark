# Daymark Android weather widget

## Data contract

The widget uses the existing Open-Meteo integration. No new weather provider or
API key is introduced. The native client requests:

- `current`: `temperature_2m`, `apparent_temperature`, `relative_humidity_2m`,
  `precipitation`, `weather_code`, `wind_speed_10m`, `wind_direction_10m`,
  `pressure_msl`, `uv_index`.
- `hourly`: `temperature_2m`, `precipitation_probability`, `precipitation`,
  `weather_code`, `visibility`.
- `daily`: `sunrise`, `sunset`.
- Air quality: `current=us_aqi` from the existing Open-Meteo air-quality host.

`pressure_msl` and `visibility` are the only fields added to the existing
app request shape. Both are available from Open-Meteo; no provider change is
needed. Missing values are displayed as `—` or omitted. Air-quality failure
does not discard the forecast.

## Statistics

All twelve requested statistics are selectable:

1. Temperature and conditions
2. Feels like
3. Humidity
4. Wind speed and direction
5. Rain probability
6. Hourly forecast
7. Rainfall amount
8. UV index
9. Air quality
10. Pressure
11. Visibility
12. Sunrise and sunset

Temperature is the primary current reading when selected. Hourly is a separate
row. The remaining selected statistics fill fixed slots in priority order; the
layout capacity is based on widget size. Resizing never edits the saved
selection.

## Configuration and layout

- Per-instance selection and order live in `daymark_widgets` under
  `stats_<appWidgetId>`.
- New widgets default to temperature, feels-like, humidity, wind, rain chance,
  hourly, UV and sunrise/sunset. Every statistic can be added or removed.
- The configuration Activity supports checkboxes and up/down priority arrows.
- `widgetFeatures="reconfigurable"` allows editing after placement where the
  launcher supports it.
- `onDeleted` removes the instance's configuration.
- Minimum size is 110dp square; both resize axes are enabled. Small widgets
  show the primary current reading and the first two selected statistics;
  medium shows six; large shows all selected cells and hourly detail.

## Refresh and privacy

- The app syncs its current unit and coarse location to the widget via the
  `WidgetSync` Capacitor plugin. No permission prompt is added.
- Default location is London, matching the app's initial place.
- A network-constrained `JobScheduler` job refreshes every 30 minutes and on
  widget updates. The last successful payload is cached and used offline;
  failed refreshes do not clear it.
- The widget requests weather/air-quality data from the existing Open-Meteo
  hosts only. It does not access the microphone, speech/transcript data or
  analytics.
- No coordinates, weather values or request URLs are logged.
- Tapping the widget opens `MainActivity`.

## Verification

Unit tests cover statistic serialization/order, empty selections, all twelve
statistics, formatting, units and unavailable values. Android lint, debug
build and TypeScript/browser tests are required before review.

## Privacy/release blocker

The shipping privacy policy currently says that Daymark stores only the
`daymark.locale` preference and does not retain location or weather history.
This widget intentionally stores a widget unit/location preference and a weather
snapshot so it can render offline, and its periodic refresh sends approximate
coordinates to Open-Meteo. Those are new device/background data flows. The
policy, security notes and Play Data safety answer must be reviewed and updated
before this widget can be released. This change does **not** update those
documents and must remain a draft until that approval is recorded.

## Outstanding limitations

- The widget requires launcher-side installation/resizing/reconfiguration
  testing on a physical device; these are not reproducible from JVM tests.
- Pressure/visibility/AQI can be unavailable for some locations; the widget
  shows `—`/omits them rather than inventing values.
- Widget labels are English in this initial implementation; the main app's
  locale routing is not applied to RemoteViews.
- Exact launcher grid behavior and reconfiguration UI vary by OEM launcher.
- The widget does not request location permission; it uses the app's last
  synced coarse location.
