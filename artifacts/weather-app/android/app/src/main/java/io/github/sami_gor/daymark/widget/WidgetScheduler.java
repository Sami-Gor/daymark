package io.github.sami_gor.daymark.widget;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;

/** Widget refresh scheduling; network-constrained and modest by design. */
public final class WidgetScheduler {
    private static final int PERIODIC_JOB_ID = 7301;
    private static final int IMMEDIATE_JOB_ID = 7302;
    private static final long PERIOD_MS = 30L * 60L * 1000L;

    private WidgetScheduler() {
    }

    public static boolean hasWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        return manager.getAppWidgetIds(
                new ComponentName(context, WeatherWidgetProvider.class)).length > 0;
    }

    public static void ensurePeriodic(Context context) {
        if (!hasWidgets(context)) {
            return;
        }
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null || scheduler.getPendingJob(PERIODIC_JOB_ID) != null) {
            return;
        }
        JobInfo job = new JobInfo.Builder(
                PERIODIC_JOB_ID,
                new ComponentName(context, WidgetRefreshJobService.class))
                .setPeriodic(PERIOD_MS)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build();
        scheduler.schedule(job);
    }

    public static void requestImmediate(Context context) {
        if (!hasWidgets(context)) {
            return;
        }
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) {
            return;
        }
        JobInfo job = new JobInfo.Builder(
                IMMEDIATE_JOB_ID,
                new ComponentName(context, WidgetRefreshJobService.class))
                .setOverrideDeadline(0)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .build();
        scheduler.schedule(job);
    }

    public static void cancel(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler != null) {
            scheduler.cancel(PERIODIC_JOB_ID);
            scheduler.cancel(IMMEDIATE_JOB_ID);
        }
    }
}
