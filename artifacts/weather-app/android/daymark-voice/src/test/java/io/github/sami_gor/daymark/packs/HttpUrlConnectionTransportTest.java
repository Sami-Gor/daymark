package io.github.sami_gor.daymark.packs;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.fail;

import java.io.File;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class HttpUrlConnectionTransportTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private static void assertUrlReason(String url, String expected) {
        try {
            HttpUrlConnectionTransport.validateUrl(url);
            fail("expected URL failure " + expected);
        } catch (PackTransport.TransportException e) {
            org.junit.Assert.assertEquals(expected, e.reason);
        }
    }

    @Test
    public void acceptsOnlyHttpsUrlsWithoutCredentials() {
        assertUrlReason("http://example.com/pack.bin", "insecure-url");
        assertUrlReason("ftp://example.com/pack.bin", "insecure-url");
        assertUrlReason("https://user:secret@example.com/pack.bin", "credentials-in-url");
        assertUrlReason("https:///no-host", "invalid-url");
        assertUrlReason("https://example.com/pack.bin#fragment", "invalid-url");
        assertUrlReason("", "invalid-url");
        assertUrlReason("not a url", "invalid-url");
        try {
            HttpUrlConnectionTransport.validateUrl("https://example.com/pack.bin?rev=3");
        } catch (PackTransport.TransportException e) {
            fail("plain HTTPS URL should be accepted");
        }
    }

    @Test
    public void rejectsInvalidUrlBeforeCreatingAFileOrOpeningASocket() throws Exception {
        HttpUrlConnectionTransport transport = new HttpUrlConnectionTransport(1000, 1000);
        File destination = new File(tmp.getRoot(), "pack.part");
        try {
            transport.download("http://example.com/pack.bin", destination, true, 10, null, null);
            fail("expected insecure-url");
        } catch (PackTransport.TransportException e) {
            org.junit.Assert.assertEquals("insecure-url", e.reason);
        }
        assertFalse(destination.exists());
    }

    @Test
    public void fetchAlsoRejectsInsecureAndCredentialUrls() {
        HttpUrlConnectionTransport transport = new HttpUrlConnectionTransport(1000, 1000);
        try {
            transport.fetch("http://example.com/manifest.json", 1024);
            fail("expected insecure-url");
        } catch (PackTransport.TransportException e) {
            org.junit.Assert.assertEquals("insecure-url", e.reason);
        }
        try {
            transport.fetch("https://token@example.com/manifest.json", 1024);
            fail("expected credentials-in-url");
        } catch (PackTransport.TransportException e) {
            org.junit.Assert.assertEquals("credentials-in-url", e.reason);
        }
    }

    @Test
    public void rejectsNonPositiveTimeouts() {
        try {
            new HttpUrlConnectionTransport(0, 1000);
            fail("expected timeout rejection");
        } catch (IllegalArgumentException expected) {
            // expected
        }
    }
}
