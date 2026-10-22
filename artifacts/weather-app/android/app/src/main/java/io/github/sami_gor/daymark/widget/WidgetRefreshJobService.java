package io.github.sami_gor.daymark.widget;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Fetches widget weather off the main thread and updates every placed widget. */
public final class WidgetRefreshJobService extends JobService {
    private Thread worker;

    @Override
    public boolean onStartJob(JobParameters params) {
        worker = new Thread(() -> {
            try {
                WidgetWeather weather = WidgetWeatherClient.fetch(getApplicationContext());
                WidgetWeatherStore.save(getApplicationContext(), weather);
            } catch (Exception ignored) {
                // Keep the cached payload; the widget remains usable offline.
            } finally {
                WeatherWidgetProvider.updateAll(getApplicationContext());
                jobFinished(params, false);
            }
        }, "daymark-widget-refresh");
        worker.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        if (worker != null) {
            worker.interrupt();
            worker = null;
        }
        return true;
    }
}
