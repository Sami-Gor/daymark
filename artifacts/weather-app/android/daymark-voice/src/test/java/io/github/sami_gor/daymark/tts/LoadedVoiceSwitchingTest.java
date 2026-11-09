package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import io.github.sami_gor.daymark.tts.KokoroEngineTestSupport.Capture;
import io.github.sami_gor.daymark.tts.KokoroEngineTestSupport.Harness;

import java.io.File;
import java.util.Arrays;
import java.util.HashSet;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * N-3 acceptance evidence: the loaded-voice set belongs to the current native
 * generation. Only the voice committed by the last successful reload is READY;
 * switching voices requires a reload, and an installed voice is never READY by
 * virtue of existing on disk.
 */
public class LoadedVoiceSwitchingTest {

    private static final String EN = NarrationVoicePolicy.ENGLISH_VOICE;
    private static final String FR = NarrationVoicePolicy.FRENCH_VOICE;

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private Harness harness;

    @Before
    public void setUp() throws Exception {
        EngineOwnership.resetForTest();
        harness = new Harness(temporaryFolder.newFolder("files"));
    }

    private void register(String voice) {
        Capture capture = new Capture();
        harness.engine.registerVoice(voice, capture);
        harness.scheduler.drain();
        assertTrue("expected " + voice + " to register", capture.succeeded());
        assertEquals(new HashSet<>(Arrays.asList(voice)), harness.loaded());
    }

    @Test
    public void switchingBetweenInstalledOptionalVoicesRequiresAReloadEachTime() {
        harness.initializeReady();
        harness.assets.install(FR);
        assertEquals(new HashSet<>(Arrays.asList(EN)), harness.loaded());

        // EN -> FR: the reload commits a new generation whose loaded set is FR.
        register(FR);

        // FR -> EN: switching back is another supported reload, not a cached set.
        register(EN);
        assertEquals(new HashSet<>(Arrays.asList(EN)), harness.loaded());
    }

    @Test
    public void aFailedSwitchNeverPublishesTheRequestedVoiceAsLoaded() {
        harness.initializeReady();
        harness.assets.install(FR);
        register(FR);

        Capture failed = new Capture();
        harness.nativeApi.failVoice(EN);
        harness.engine.registerVoice(EN, failed);
        harness.scheduler.drain();

        assertFalse(failed.succeeded());
        assertEquals("reload-failed", failed.lastError());
        // The previous working voice stays loaded; EN is not reported loaded.
        assertTrue(harness.loaded().contains(FR));
        assertFalse(harness.loaded().contains(EN));
        assertEquals(LocalTtsEngine.State.READY, harness.listener.lastState());
    }

    @Test
    public void aStaleSwitchCompletionCannotAlterTheLoadedVoiceSet() {
        harness.initializeReady();
        harness.assets.install(FR);
        register(FR);

        // EN load begins, then shutdown supersedes it before completion.
        harness.listener.clear();
        harness.nativeApi.onInit = new Runnable() {
            @Override
            public void run() {
                harness.engine.shutdown();
            }
        };
        Capture stale = new Capture();
        harness.engine.registerVoice(EN, stale);
        harness.scheduler.drain();

        assertFalse(stale.succeeded());
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertFalse(harness.listener.states.contains(LocalTtsEngine.State.READY));
        assertEquals(LocalTtsEngine.State.UNINITIALIZED, harness.listener.lastState());
    }
}
