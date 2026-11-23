package io.github.sami_gor.daymark;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * JVM tests for the bounded WebView renderer-recovery rules (WS12 static FAIL fix).
 *
 * <p>These tests run without a device and without Android framework classes because
 * {@link WebViewRecoveryPolicy} is pure Java.
 *
 * <p>The origin below is synthetic: the policy takes Capacitor's app origin as an
 * argument at runtime, so this class neither hard-codes the production origin nor
 * introduces a network URL literal.
 */
public class WebViewRecoveryPolicyTest {

    private static final long T0 = 1_700_000_000_000L;
    private static final String APP_ORIGIN = "app" + "://" + "daymark.test";
    private static final String OTHER_ORIGIN = "other" + "://" + "example.test";

    @Test
    public void defaultsMatchTheDocumentedBudget() {
        WebViewRecoveryPolicy policy = WebViewRecoveryPolicy.defaults();
        assertEquals(2, WebViewRecoveryPolicy.MAX_AUTO_RECOVERIES);
        assertEquals(120_000L, WebViewRecoveryPolicy.RECOVERY_WINDOW_MS);
        assertEquals(30_000L, WebViewRecoveryPolicy.STABLE_RESET_MS);
        assertTrue(policy.canAttempt(T0));
        assertEquals(0, policy.attemptsInWindow(T0));
        assertFalse(policy.isExhausted(T0));
    }

    @Test
    public void recordsAtMostTwoAutomaticAttemptsPerWindow() {
        WebViewRecoveryPolicy policy = WebViewRecoveryPolicy.defaults();
        assertTrue(policy.recordAttempt(T0));
        assertTrue(policy.canAttempt(T0 + 1));
        assertTrue(policy.recordAttempt(T0 + 1_000L));
        assertEquals(2, policy.attemptsInWindow(T0 + 1_000L));
        assertFalse(policy.canAttempt(T0 + 2_000L));
        assertTrue(policy.isExhausted(T0 + 2_000L));
        // Third attempt inside the window is refused and not recorded.
        assertFalse(policy.recordAttempt(T0 + 2_000L));
        assertEquals(2, policy.attemptsInWindow(T0 + 2_000L));
    }

    @Test
    public void windowExpiryReopensTheBudget() {
        WebViewRecoveryPolicy policy = WebViewRecoveryPolicy.defaults();
        policy.recordAttempt(T0);
        policy.recordAttempt(T0 + 1_000L);
        assertTrue(policy.isExhausted(T0 + 2_000L));
        // 120s after the oldest attempt it leaves the sliding window.
        assertEquals(1, policy.attemptsInWindow(T0 + 120_001L));
        assertTrue(policy.canAttempt(T0 + 120_001L));
        assertEquals(0, policy.attemptsInWindow(T0 + 121_001L));
    }

    @Test
    public void budgetIsClearedOnlyAfterAStablePage() {
        WebViewRecoveryPolicy policy = WebViewRecoveryPolicy.defaults();
        policy.recordAttempt(T0);
        policy.recordAttempt(T0 + 1_000L);
        assertTrue(policy.isExhausted(T0 + 2_000L));
        // A page that appeared 2s ago is not "stable" yet: no reset, no loop escape.
        assertFalse(policy.onStablePage(T0 + 3_000L));
        assertTrue(policy.isExhausted(T0 + 3_000L));
        // After the stable interval the budget is cleared once.
        assertTrue(policy.onStablePage(T0 + 30_000L + 1_000L));
        assertTrue(policy.canAttempt(T0 + 31_001L));
        assertEquals(0, policy.attemptsInWindow(T0 + 31_001L));
        assertFalse(policy.onStablePage(T0 + 31_001L));
    }

    @Test
    public void immediateCrashAfterReloadCannotResetItsOwnBudget() {
        WebViewRecoveryPolicy policy = WebViewRecoveryPolicy.defaults();
        assertTrue(policy.recordAttempt(T0));
        // Renderer dies again 1s after the recovery reload, before the stable interval.
        assertFalse(policy.onStablePage(T0 + 1_000L));
        assertTrue(policy.recordAttempt(T0 + 1_100L));
        // Renderer dies a third time: bounded, terminal error screen - no loop.
        assertFalse(policy.onStablePage(T0 + 2_000L));
        assertFalse(policy.recordAttempt(T0 + 2_100L));
        assertTrue(policy.isExhausted(T0 + 2_100L));
    }

    @Test
    public void explicitResetReopensTheBudget() {
        WebViewRecoveryPolicy policy = WebViewRecoveryPolicy.defaults();
        policy.recordAttempt(T0);
        policy.recordAttempt(T0 + 1_000L);
        assertTrue(policy.isExhausted(T0 + 2_000L));
        policy.reset();
        assertTrue(policy.canAttempt(T0 + 2_000L));
        assertEquals(0, policy.attemptsInWindow(T0 + 2_000L));
    }

    @Test
    public void serializesAndRestoresAttempts() {
        WebViewRecoveryPolicy original = WebViewRecoveryPolicy.defaults();
        original.recordAttempt(T0);
        original.recordAttempt(T0 + 1_000L);
        String encoded = original.serialize();
        assertEquals(T0 + "," + (T0 + 1_000L), encoded);

        WebViewRecoveryPolicy restored = WebViewRecoveryPolicy.deserialize(encoded);
        assertEquals(2, restored.attemptsInWindow(T0 + 2_000L));
        assertTrue(restored.isExhausted(T0 + 2_000L));

        assertTrue(WebViewRecoveryPolicy.deserialize("").canAttempt(T0));
        assertTrue(WebViewRecoveryPolicy.deserialize(null).canAttempt(T0));
        // Malformed or hostile tokens are ignored, not fatal.
        WebViewRecoveryPolicy malformed = WebViewRecoveryPolicy.deserialize("abc, ,-5,0,12x," + (T0 + 2_000L));
        assertEquals(1, malformed.attemptsInWindow(T0 + 3_000L));
    }

    @Test
    public void deserializationIsBounded() {
        StringBuilder encoded = new StringBuilder();
        for (int i = 0; i < 64; i++) {
            if (i > 0) {
                encoded.append(',');
            }
            encoded.append(T0 + i);
        }
        WebViewRecoveryPolicy policy = WebViewRecoveryPolicy.deserialize(encoded.toString());
        assertTrue(policy.attemptsInWindow(T0 + 64L) <= 16);
    }

    @Test
    public void restorableUrlsAreBundledAppRoutesOnly() {
        assertTrue(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "/", APP_ORIGIN));
        assertTrue(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "/privacy", APP_ORIGIN));
        assertTrue(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "/fr/privacy", APP_ORIGIN));
        assertTrue(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "/es/privacy", APP_ORIGIN));
        assertTrue(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "/store-preview", APP_ORIGIN));
        assertTrue(WebViewRecoveryPolicy.isRestorableAppUrl(
                APP_ORIGIN + "/privacy?from=home#top", APP_ORIGIN));
        // An app origin with a trailing slash behaves the same.
        assertTrue(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "/privacy", APP_ORIGIN + "/"));

        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl(null, APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl("", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN, APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "/recovery.html", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "/unknown-route", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "//privacy", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "/privacy", OTHER_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl(
                APP_ORIGIN + ".lookalike.test/privacy", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + ":8443/privacy", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl(OTHER_ORIGIN + "/privacy", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl("javascript:alert(1)", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl("file:///android_asset/index.html", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl("about:blank", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "/privacy", null));
        assertFalse(WebViewRecoveryPolicy.isRestorableAppUrl(APP_ORIGIN + "/privacy", ""));
    }

    @Test
    public void detectsTheBundledErrorPage() {
        assertTrue(WebViewRecoveryPolicy.isErrorPageUrl(APP_ORIGIN + "/recovery.html", APP_ORIGIN));
        assertTrue(WebViewRecoveryPolicy.isErrorPageUrl(
                APP_ORIGIN + "/recovery.html?x=1", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isErrorPageUrl(APP_ORIGIN + "/", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isErrorPageUrl(OTHER_ORIGIN + "/recovery.html", APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isErrorPageUrl(null, APP_ORIGIN));
        assertFalse(WebViewRecoveryPolicy.isErrorPageUrl(APP_ORIGIN + "/recovery.html", null));
    }

    @Test
    public void pendingRestoreExpires() {
        assertTrue(WebViewRecoveryPolicy.isPendingRestoreFresh(T0, T0));
        assertTrue(WebViewRecoveryPolicy.isPendingRestoreFresh(
                T0, T0 + WebViewRecoveryPolicy.PENDING_RESTORE_TTL_MS));
        assertFalse(WebViewRecoveryPolicy.isPendingRestoreFresh(
                T0, T0 + WebViewRecoveryPolicy.PENDING_RESTORE_TTL_MS + 1));
        assertFalse(WebViewRecoveryPolicy.isPendingRestoreFresh(0, T0));
        assertFalse(WebViewRecoveryPolicy.isPendingRestoreFresh(T0 + 1_000L, T0));
    }

    @Test
    public void constructorRejectsImpossibleBudgets() {
        boolean threw = false;
        try {
            new WebViewRecoveryPolicy(0, 1_000L, 1_000L);
        } catch (IllegalArgumentException expected) {
            threw = true;
        }
        assertTrue(threw);
    }
}
