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

    private static WebViewRecoveryPolicy.AssetDecision fail(WebViewRecoveryPolicy policy) {
        return policy.onAssetFailure();
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

        assertEquals(WebViewRecoveryPolicy.AssetDecision.SHOW_WITH_RETRY, fail(policy));
        assertEquals(WebViewRecoveryPolicy.AssetDecision.IGNORE, fail(policy));
        assertEquals(WebViewRecoveryPolicy.AssetDecision.IGNORE, fail(policy));
    }

    @Test
    public void reloadFailureShowsTerminalScreenWithoutAnotherLoop() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy();
        assertEquals(WebViewRecoveryPolicy.AssetDecision.SHOW_WITH_RETRY, fail(policy));
        policy.onReloadStarted();

        assertEquals(WebViewRecoveryPolicy.AssetDecision.SHOW_TERMINAL, fail(policy));
        assertEquals(WebViewRecoveryPolicy.AssetDecision.IGNORE, fail(policy));
    }

    @Test
    public void pageFinishedAloneDoesNotResetTheRecoveryCycle() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy();
        assertEquals(WebViewRecoveryPolicy.AssetDecision.SHOW_WITH_RETRY, fail(policy));
        policy.onReloadStarted();
        policy.onNavigationStarted();

        // Even the application entry point finishing is not an application-
        // ready signal; the client still has to verify rendered content.
        assertTrue(policy.onApplicationPageFinished(local("/"), local("")));
        assertEquals(WebViewRecoveryPolicy.AssetDecision.SHOW_TERMINAL, fail(policy));
    }

    @Test
    public void errorPageOrDifferentPathCannotConfirmReadiness() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy();
        policy.onNavigationStarted();

        assertFalse(policy.onApplicationPageFinished(
                local("/error.html"), local("")));
        assertFalse(policy.onApplicationPageFinished(
                local("/index.html"), local("")));
        assertFalse(policy.onApplicationPageFinished(
                SCHEME + "api.open-meteo.com/", local("")));
        assertFalse(policy.onApplicationPageFinished(null, local("")));

        assertTrue(policy.onApplicationPageFinished(local("/"), local("")));
        assertTrue(policy.onApplicationPageFinished(local("/?lang=fr"), local("")));
        assertTrue(policy.onApplicationPageFinished(local(""), local("/")));
    }

    @Test
    public void failedNavigationCannotConfirmReadiness() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy();
        policy.onNavigationStarted();
        assertEquals(WebViewRecoveryPolicy.AssetDecision.SHOW_WITH_RETRY, fail(policy));
        policy.onReloadStarted();

        assertFalse(policy.onApplicationPageFinished(local("/"), local("")));
        assertEquals(WebViewRecoveryPolicy.AssetDecision.SHOW_TERMINAL, fail(policy));
    }

    @Test
    public void applicationReadyResetsTheAssetRecoveryCycle() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy();
        assertEquals(WebViewRecoveryPolicy.AssetDecision.SHOW_WITH_RETRY, fail(policy));
        policy.onReloadStarted();
        policy.onApplicationReady();

        assertEquals(WebViewRecoveryPolicy.AssetDecision.SHOW_WITH_RETRY, fail(policy));
    }

    @Test
    public void rendererTerminationReplacesTheWebViewOnlyOnce() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy();

        assertEquals(
                WebViewRecoveryPolicy.RendererDecision.REPLACE_WEBVIEW,
                policy.onRendererGone());
        assertEquals(
                WebViewRecoveryPolicy.RendererDecision.SHOW_TERMINAL,
                policy.onRendererGone());
        assertEquals(
                WebViewRecoveryPolicy.RendererDecision.SHOW_TERMINAL,
                policy.onRendererGone());
    }

    @Test
    public void restoredRendererAttemptPreventsAnotherReplacement() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy(true);

        assertEquals(
                WebViewRecoveryPolicy.RendererDecision.SHOW_TERMINAL,
                policy.onRendererGone());
    }

    @Test
    public void applicationReadyDoesNotReArmRendererReplacement() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy();
        assertEquals(
                WebViewRecoveryPolicy.RendererDecision.REPLACE_WEBVIEW,
                policy.onRendererGone());
        policy.onApplicationReady();

        assertEquals(
                WebViewRecoveryPolicy.RendererDecision.SHOW_TERMINAL,
                policy.onRendererGone());
    }

    @Test
    public void rendererTerminationDoesNotAuthorizeAssetReload() {
        WebViewRecoveryPolicy policy = new WebViewRecoveryPolicy();
        policy.onRendererGone();

        // The renderer path never arms the asset retry action; a later asset
        // callback still starts a normal first-retry cycle.
        assertEquals(WebViewRecoveryPolicy.AssetDecision.SHOW_WITH_RETRY, fail(policy));
    }
}
