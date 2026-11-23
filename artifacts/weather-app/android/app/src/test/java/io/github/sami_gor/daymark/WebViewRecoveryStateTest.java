package io.github.sami_gor.daymark;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Before;
import org.junit.Test;

/**
 * JVM tests for the in-process recovery state (WS12 fix).
 *
 * <p>The state survives {@code Activity.recreate()} because it is a process
 * singleton, and it deliberately adds no persistent storage.
 */
public class WebViewRecoveryStateTest {

    private static final long T0 = 1_700_000_000_000L;
    private static final String ROUTE = "app" + "://" + "daymark.test/privacy";

    private WebViewRecoveryState state;

    @Before
    public void resetSingleton() {
        state = WebViewRecoveryState.get();
        state.consumePendingRestoreUrl();
        state.clearRebuildPending();
        state.resetPolicy();
    }

    @Test
    public void startsWithoutAnyPendingNavigation() {
        assertFalse(state.hasPendingRestoreUrl());
        assertEquals(0L, state.pendingRestoreSavedAtMs());
        assertNull(state.consumePendingRestoreUrl());
        assertTrue(state.policy().canAttempt(T0));
    }

    @Test
    public void keepsTheNavigationAcrossActivityRecreationUntilConsumed() {
        state.savePendingRestoreUrl(ROUTE, T0);
        // The recreated Activity reads the same process singleton.
        assertEquals(ROUTE, state.consumePendingRestoreUrl());
        assertFalse(state.hasPendingRestoreUrl());
        assertEquals(0L, state.pendingRestoreSavedAtMs());
        // Consumed exactly once; a second read does not replay the route.
        assertNull(state.consumePendingRestoreUrl());
    }

    @Test
    public void ignoresANullNavigation() {
        state.savePendingRestoreUrl(null, T0);
        assertFalse(state.hasPendingRestoreUrl());
    }

    @Test
    public void tracksAnAcceptedRebuildUntilTheRebuiltPageLoads() {
        assertFalse(state.hasRebuildPending());
        state.markRebuildPending();
        assertTrue(WebViewRecoveryState.get().hasRebuildPending());
        state.clearRebuildPending();
        assertFalse(state.hasRebuildPending());
    }

    @Test
    public void sharesTheBoundedBudgetAcrossTheRecreatedActivity() {
        assertTrue(state.policy().recordAttempt(T0));
        assertTrue(state.policy().recordAttempt(T0 + 1_000L));
        assertTrue(state.policy().isExhausted(T0 + 2_000L));
        // MainActivity sees the same budget after recreation and shows the terminal screen.
        assertTrue(WebViewRecoveryState.get().policy().isExhausted(T0 + 2_000L));
        state.resetPolicy();
        assertTrue(state.policy().canAttempt(T0 + 3_000L));
    }

    @Test
    public void stablePageClearsTheSharedBudget() {
        state.policy().recordAttempt(T0);
        state.policy().recordAttempt(T0 + 1_000L);
        assertFalse(state.policy().onStablePage(T0 + 2_000L));
        assertTrue(state.policy().onStablePage(T0 + 31_001L));
        assertTrue(WebViewRecoveryState.get().policy().canAttempt(T0 + 32_000L));
    }
}
