package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.Arrays;
import java.util.HashSet;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * H9: a native init failure must never become a successful init.
 *
 * <p>{@code nativeInit} encodes success as a {@code null} return and failure
 * as an allocated error string. The error string is a JNI allocation, and a
 * JNI implementation may report that allocation failing by returning
 * {@code null} without an exception (the Java SE JNI specification explicitly
 * permits a function that can return NULL and throw on error to "choose only
 * to return NULL ... but not throw any exception"). The bridge therefore also
 * reports the real result through the allocation-free
 * {@link KokoroLocalTtsEngine.NativeApi#initSucceeded()} flag, and the engine
 * must require it before claiming ownership, publishing loaded voices or
 * reporting READY.
 *
 * <p>These tests drive the real engine with a fake bridge that reproduces the
 * exact ambiguity: a failed init that returns the null success sentinel. They
 * are deterministic and do not need the native library; the production JNI
 * symbol is exercised on device.
 */
public class KokoroNativeInitResultContractTest {

    private static final String EN = NarrationVoicePolicy.ENGLISH_VOICE;
    private static final String FR = NarrationVoicePolicy.FRENCH_VOICE;

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    private KokoroEngineTestSupport.Harness harness;

    @Before
    public void setUp() throws Exception {
        EngineOwnership.resetForTest();
        File root = temporaryFolder.newFolder("files");
        harness = new KokoroEngineTestSupport.Harness(root);
    }

    @Test
    public void nullInitErrorWithoutAnEngineNeverPublishesReady() {
        // The bridge fails, loses its error string and returns null: the same
        // observable a successful init produces.
        harness.nativeApi.failAll = true;
        harness.nativeApi.loseInitErrorString = true;

        harness.engine.initialize(harness.listener);
        harness.scheduler.drain();

        assertEquals("a lost error string must not be read as a successful init",
                Arrays.asList(LocalTtsEngine.State.LOADING, LocalTtsEngine.State.ERROR),
                harness.listener.states);
        assertTrue("no voice may be reported loaded", harness.engine.loadedVoices().isEmpty());
        assertEquals("no native instance was created", 0, harness.nativeApi.successfulInitCalls);
        assertEquals("nothing may be released: no instance exists",
                0, harness.nativeApi.releaseCount);
        assertFalse("no native ownership may be claimed",
                KokoroEngineTestSupport.nativeInstanceLive(harness.engine));
        assertFalse("a failed init cannot own the process-wide generation",
                EngineOwnership.owns(EngineOwnership.currentGeneration()));
        assertEquals(1, harness.listener.errors.size());
        assertTrue("the failure must be reported synchronously",
                harness.listener.errors.get(0).contains("native engine missing after init"));
    }

    @Test
    public void aThrownNativeInitFailureEndsInErrorNotReady() {
        // The other JNI failure mode: the allocation failure is reported as a
        // pending OutOfMemoryError, which the JVM throws at the native return.
        harness.nativeApi.onInit = new Runnable() {
            @Override
            public void run() {
                throw new OutOfMemoryError("simulated JNI string allocation failure");
            }
        };

        harness.engine.initialize(harness.listener);
        harness.scheduler.drain();

        assertEquals(Arrays.asList(LocalTtsEngine.State.LOADING, LocalTtsEngine.State.ERROR),
                harness.listener.states);
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertEquals(0, harness.nativeApi.successfulInitCalls);
        assertFalse(KokoroEngineTestSupport.nativeInstanceLive(harness.engine));
        assertFalse(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    @Test
    public void lostErrorStringDuringReloadRestoresThePreviousVoice() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.nativeApi.failVoice(FR);
        harness.nativeApi.loseInitErrorString = true;
        harness.listener.clear();
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, capture);
        harness.scheduler.drain();

        assertEquals("a lost error string is still a failed registration",
                "reload-failed", capture.lastError());
        assertFalse(capture.succeeded());
        assertEquals("the previously loaded voice must stay loaded",
                new HashSet<>(Arrays.asList(EN)), harness.loaded());
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.READY),
                harness.listener.states);
        assertEquals(Arrays.asList(EN, FR, EN), harness.nativeApi.initCalls);
        assertTrue("the restored voice keeps native ownership",
                EngineOwnership.owns(EngineOwnership.currentGeneration()));
        assertEquals("the failed init must not be counted as a created instance",
                2, harness.nativeApi.successfulInitCalls);
    }

    @Test
    public void lostErrorStringWithFailedRecoveryEndsInError() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.nativeApi.failAll = true;
        harness.nativeApi.loseInitErrorString = true;
        harness.listener.clear();
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, capture);
        harness.scheduler.drain();

        assertEquals("reload-failed-unrecovered", capture.lastError());
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.ERROR),
                harness.listener.states);
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertFalse(EngineOwnership.owns(EngineOwnership.currentGeneration()));
        assertFalse(KokoroEngineTestSupport.nativeInstanceLive(harness.engine));
        assertEquals("only the original successful init created an instance",
                1, harness.nativeApi.successfulInitCalls);
    }
}
