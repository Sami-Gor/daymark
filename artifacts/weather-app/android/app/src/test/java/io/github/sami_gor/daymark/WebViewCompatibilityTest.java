package io.github.sami_gor.daymark;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WebViewCompatibilityTest {

    @Test
    public void parsesLeadingMajorVersions() {
        assertEquals(Integer.valueOf(53), WebViewCompatibility.parseMajorVersion("53.0.2785.124"));
        assertEquals(Integer.valueOf(91), WebViewCompatibility.parseMajorVersion("91.0.4472.114"));
        assertEquals(Integer.valueOf(124), WebViewCompatibility.parseMajorVersion("124.0.6367.219"));
        assertEquals(Integer.valueOf(90), WebViewCompatibility.parseMajorVersion(" 90 "));
    }

    @Test
    public void rejectsMissingOrMalformedVersions() {
        assertNull(WebViewCompatibility.parseMajorVersion(null));
        assertNull(WebViewCompatibility.parseMajorVersion(""));
        assertNull(WebViewCompatibility.parseMajorVersion("Chrome/124"));
    }

    @Test
    public void blocksUnsupportedAndAllowsValidatedWebViews() {
        assertFalse(WebViewCompatibility.isSupported(null));
        assertFalse(WebViewCompatibility.isSupported(53));
        assertFalse(WebViewCompatibility.isSupported(89));
        assertTrue(WebViewCompatibility.isSupported(90));
        assertTrue(WebViewCompatibility.isSupported(91));
        assertTrue(WebViewCompatibility.isSupported(124));
    }

    @Test
    public void convenienceChecksVersionNames() {
        assertFalse(WebViewCompatibility.isSupportedVersionName("53.0.2785.124"));
        assertTrue(WebViewCompatibility.isSupportedVersionName("91.0.4472.114"));
        assertFalse(WebViewCompatibility.isSupportedVersionName(null));
    }
}
