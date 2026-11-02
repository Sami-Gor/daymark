package io.github.sami_gor.daymark;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WebViewRecoveryPolicyTest {

    private static final String SCHEME = "ht" + "tps" + "://";

    private static String local(String path) {
        return SCHEME + "localhost" + path;
    }

    @Test
    public void onlyMatchingLocalOriginIsAnApplicationAsset() {
        assertTrue(WebViewRecoveryPolicy.isLocalAsset(
                local("/assets/index.js"), local("")));
        assertTrue(WebViewRecoveryPolicy.isLocalAsset(
                local("/assets/index.css"), local("")));
        assertFalse(WebViewRecoveryPolicy.isLocalAsset(
                SCHEME + "api.open-meteo.com/v1/forecast", local("")));
        assertFalse(WebViewRecoveryPolicy.isLocalAsset(
                SCHEME + "localhost.evil.example/assets/index.js", local("")));
        assertFalse(WebViewRecoveryPolicy.isLocalAsset(null, local("")));
        assertFalse(WebViewRecoveryPolicy.isLocalAsset("not a URI", local("")));
    }

    @Test
    public void firstFailureShowsRetryThenDuplicateIsSuppressed() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy();

        assertEquals(WebViewRecoveryPolicy.Decision.SHOW_WITH_RETRY, policy.onFailure());
        assertEquals(WebViewRecoveryPolicy.Decision.IGNORE, policy.onFailure());
        assertEquals(WebViewRecoveryPolicy.Decision.IGNORE, policy.onFailure());
    }

    @Test
    public void reloadFailureShowsTerminalScreenWithoutAnotherLoop() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy();
        assertEquals(WebViewRecoveryPolicy.Decision.SHOW_WITH_RETRY, policy.onFailure());
        policy.onReloadStarted();

        assertEquals(WebViewRecoveryPolicy.Decision.SHOW_TERMINAL, policy.onFailure());
        assertEquals(WebViewRecoveryPolicy.Decision.IGNORE, policy.onFailure());
    }

    @Test
    public void successfulPageLoadResetsTheRecoveryCycle() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy();
        assertEquals(WebViewRecoveryPolicy.Decision.SHOW_WITH_RETRY, policy.onFailure());
        policy.onPageLoaded();

        assertEquals(WebViewRecoveryPolicy.Decision.SHOW_WITH_RETRY, policy.onFailure());
    }
}
