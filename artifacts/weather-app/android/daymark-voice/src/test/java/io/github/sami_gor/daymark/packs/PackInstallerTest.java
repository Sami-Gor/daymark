package io.github.sami_gor.daymark.packs;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class PackInstallerTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] bytes = java.nio.file.Files.readAllBytes(file.toPath());
        digest.update(bytes);
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    private File packFile(String name, String content) throws Exception {
        File file = tmp.newFile(name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
        }
        return file;
    }

    private File root() throws Exception {
        return tmp.newFolder("packs-root");
    }

    @Test
    public void stagesAndActivatesAVerifiedPack() throws Exception {
        File source = packFile("fr.bin", "french-voice-bytes");
        PackInstaller installer = new PackInstaller(root());
        PackInstaller.Installed installed =
                installer.stage("fr", 1, source, source.length(), sha256(source));
        assertEquals(0, installer.activeVersion("fr"));
        installer.activate(installed);
        assertEquals(1, installer.activeVersion("fr"));
        assertNotNull(installer.activePayload("fr"));
        assertTrue(installer.activePayload("fr").isFile());
    }

    @Test
    public void rejectsAHashMismatchWithoutActivating() throws Exception {
        File good = packFile("fr-good.bin", "good");
        PackInstaller installer = new PackInstaller(root());
        installer.activate(installer.stage("fr", 1, good, good.length(), sha256(good)));

        File tampered = packFile("fr-bad.bin", "tampered");
        try {
            installer.stage("fr", 2, tampered, tampered.length(), sha256(good));
            fail("expected hash-mismatch");
        } catch (PackInstaller.PackException e) {
            assertEquals("hash-mismatch", e.reason);
        }
        assertEquals("previous working version must stay active", 1, installer.activeVersion("fr"));
    }

    @Test
    public void rejectsTruncatedOrOversizedDownloads() throws Exception {
        File source = packFile("fr.bin", "abc");
        PackInstaller installer = new PackInstaller(root());
        try {
            installer.stage("fr", 1, source, 10, sha256(source));
            fail("expected size-mismatch");
        } catch (PackInstaller.PackException e) {
            assertEquals("size-mismatch", e.reason);
        }
    }

    @Test
    public void updateKeepsThePreviousVersionOnDisk() throws Exception {
        File packRoot = root();
        PackInstaller installer = new PackInstaller(packRoot);
        File v1 = packFile("fr-v1.bin", "v1");
        installer.activate(installer.stage("fr", 1, v1, v1.length(), sha256(v1)));
        File v2 = packFile("fr-v2.bin", "v2");
        installer.activate(installer.stage("fr", 2, v2, v2.length(), sha256(v2)));

        assertEquals(2, installer.activeVersion("fr"));
        assertTrue(new File(packRoot, "packs/fr/1/payload").isFile());
    }

    @Test
    public void englishCannotBeRemovedButOptionalPacksCan() throws Exception {
        PackInstaller installer = new PackInstaller(root());
        try {
            installer.remove(PackInstaller.BUILTIN_ENGLISH);
            fail("expected builtin-pack");
        } catch (PackInstaller.PackException e) {
            assertEquals("builtin-pack", e.reason);
        }

        File source = packFile("es.bin", "spanish");
        installer.activate(installer.stage("es", 1, source, source.length(), sha256(source)));
        installer.remove("es");
        assertEquals(0, installer.activeVersion("es"));
        assertNull(installer.activePayload("es"));
    }

    @Test
    public void rejectsInvalidPackIds() throws Exception {
        File source = packFile("x.bin", "x");
        PackInstaller installer = new PackInstaller(root());
        try {
            installer.stage("english", 1, source, source.length(), sha256(source));
            fail("expected invalid-pack");
        } catch (PackInstaller.PackException e) {
            assertEquals("invalid-pack", e.reason);
        }
    }
}
