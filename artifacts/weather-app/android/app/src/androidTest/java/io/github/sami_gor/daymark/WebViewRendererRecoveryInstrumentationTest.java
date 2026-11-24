package io.github.sami_gor.daymark;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertTrue;

import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.atomic.AtomicReference;

/** Instrumentation coverage for the real Capacitor WebView renderer-recovery path. */
@RunWith(AndroidJUnit4.class)
public class WebViewRendererRecoveryInstrumentationTest {

    private static final String PRIVACY_URL = "https://localhost/privacy";

    @Before
    public void resetRecoveryState() {
        WebViewRecoveryState state = WebViewRecoveryState.get();
        state.consumePendingRestoreUrl();
        state.clearRebuildPending();
        state.resetPolicy();
    }

    @Test
    public void rendererCrashRecoversIntoANewActivity() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            MainActivity before = current(scenario);
            crash(scenario);
            waitForNewActivity(scenario, before, 15_000);
            waitForUi(scenario, 15_000);
            MainActivity after = current(scenario);
            assertNotSame(before, after);
            assertTrue(after.getBridge() != null);
            assertTrue(after.getBridge().getWebView() != null);
        }
    }

    @Test
    public void threeRapidRendererCrashesReachTerminalFallback() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            MainActivity before = current(scenario);
            crash(scenario);
            waitForNewActivity(scenario, before, 15_000);
            waitForUi(scenario, 15_000);

            before = current(scenario);
            crash(scenario);
            waitForNewActivity(scenario, before, 15_000);
            waitForUi(scenario, 15_000);

            before = current(scenario);
            crash(scenario);
            waitForTerminalScreen(scenario, 15_000);
            assertTrue(WebViewRecoveryState.get().policy().isExhausted(System.currentTimeMillis()));
        }
    }

    private static MainActivity current(ActivityScenario<MainActivity> scenario) {
        AtomicReference<MainActivity> ref = new AtomicReference<>();
        scenario.onActivity(ref::set);
        return ref.get();
    }

    private static void navigate(ActivityScenario<MainActivity> scenario, String url) {
        scenario.onActivity(activity -> activity.getBridge().getWebView().loadUrl(url));
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
    }

    private static void crash(ActivityScenario<MainActivity> scenario) {
        scenario.onActivity(activity -> activity.getBridge().getWebView().loadUrl("chrome://crash"));
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
    }

    private static void waitForUrl(ActivityScenario<MainActivity> scenario, String expected, long timeoutMs) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            String url = currentUrl(scenario);
            if (url != null && url.startsWith(expected)) return;
            Thread.sleep(200);
        }
        throw new AssertionError("route not restored: " + currentUrl(scenario));
    }

    private static String currentUrl(ActivityScenario<MainActivity> scenario) {
        AtomicReference<String> ref = new AtomicReference<>();
        try {
            scenario.onActivity(activity -> {
                if (activity.getBridge() != null && activity.getBridge().getWebView() != null) {
                    ref.set(activity.getBridge().getWebView().getUrl());
                }
            });
        } catch (Throwable ignored) {
            // Activity may be mid-recreation.
        }
        return ref.get();
    }

    private static void waitForNewActivity(ActivityScenario<MainActivity> scenario, MainActivity before, long timeoutMs) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            MainActivity now = current(scenario);
            if (now != null && now != before) return;
            Thread.sleep(200);
        }
        throw new AssertionError("Activity was not recreated");
    }

    private static void waitForUi(ActivityScenario<MainActivity> scenario, long timeoutMs) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            try {
                scenario.onActivity(activity -> assertTrue(activity.getBridge() != null));
                return;
            } catch (Throwable ignored) {
                Thread.sleep(200);
            }
        }
        throw new AssertionError("recovered UI did not attach");
    }

    private static void waitForTerminalScreen(ActivityScenario<MainActivity> scenario, long timeoutMs) throws Exception {
        long deadline = SystemClock.uptimeMillis() + timeoutMs;
        while (SystemClock.uptimeMillis() < deadline) {
            try {
                AtomicReference<Boolean> found = new AtomicReference<>(false);
                scenario.onActivity(activity -> {
                    String expected = activity.getString(R.string.webview_recovery_title);
                    found.set(containsText(activity.findViewById(android.R.id.content), expected));
                });
                if (Boolean.TRUE.equals(found.get())) return;
            } catch (Throwable ignored) {
                // Activity may be recreating.
            }
            Thread.sleep(200);
        }
        throw new AssertionError("terminal fallback screen not shown");
    }

    private static boolean containsText(View view, String expected) {
        if (view instanceof TextView) {
            CharSequence text = ((TextView) view).getText();
            if (text != null && expected.contentEquals(text)) return true;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                if (containsText(group.getChildAt(i), expected)) return true;
            }
        }
        return false;
    }
}
