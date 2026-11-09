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
 * M2: the reload is observable through the existing
 * {@link LocalTtsEngine.State} machine.
 *
 * <p>These tests drive the real engine code with a manual scheduler so every
 * transition is asserted deterministically: registration enters LOADING,
 * READY is published only after the native init succeeded and the ownership
 * generation committed, and a failed reload is either recovered (previously
 * working voice restored) or terminal (ERROR) — never silently READY.
 */
public class KokoroLocalTtsEngineStateTest {

    private static final String EN = NarrationVoicePolicy.ENGLISH_VOICE;
    private static final String FR = NarrationVoicePolicy.FRENCH_VOICE;
    private static final String ES = NarrationVoicePolicy.SPANISH_VOICE;

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
    public void initialStateLoadsNoVoices() {
        assertTrue(harness.listener.states.isEmpty());
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertFalse(harness.engine.isSpeaking());
    }

    @Test
    public void initializeEntersLoadingAndOnlyCommitsReadyAfterNativeInit() {
        harness.engine.initialize(harness.listener);

        // LOADING is published before any native work runs.
        harness.scheduler.runAllMain();
        assertEquals(Arrays.asList(LocalTtsEngine.State.LOADING), harness.listener.states);
        assertTrue(harness.nativeApi.initCalls.isEmpty());
        assertTrue("nothing is loaded before a committed init",
                harness.engine.loadedVoices().isEmpty());

        harness.scheduler.runAllWorker();
        // Native init happened, but READY is a main-thread notification.
        assertEquals(Arrays.asList(EN), harness.nativeApi.initCalls);
        assertEquals(new HashSet<>(Arrays.asList(EN)), harness.loaded());
        assertEquals(Arrays.asList(LocalTtsEngine.State.LOADING), harness.listener.states);

        harness.scheduler.runAllMain();
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.READY),
                harness.listener.states);
    }

    @Test
    public void failedInitializationEndsInErrorAndLoadsNoVoice() {
        harness.nativeApi.failAll = true;
        harness.engine.initialize(harness.listener);
        harness.scheduler.drain();

        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.ERROR),
                harness.listener.states);
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertEquals(1, harness.listener.errors.size());
        assertTrue(harness.listener.errors.get(0).contains("Initialization failed"));
        assertFalse(EngineOwnership.owns(1));
    }

    @Test
    public void unavailableNativeLibraryEndsInErrorWithoutTouchingNativeInit() {
        harness.nativeApi.loaded = false;
        harness.nativeApi.loadFailure = NativeLibraryState.REASON_NATIVE_BLOCKED;
        harness.engine.initialize(harness.listener);
        harness.scheduler.drain();

        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.ERROR),
                harness.listener.states);
        assertTrue(harness.nativeApi.initCalls.isEmpty());
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertEquals("Initialization failed: native-blocked", harness.listener.errors.get(0));
    }

    @Test
    public void registrationIsObservableAsLoadingAndReadyOnlyAfterCommit() {
        harness.initializeReady();
        harness.listener.clear();
        harness.assets.install(FR);
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, capture);
        harness.scheduler.runAllMain();

        // The reload is in the existing state machine and nothing is claimed
        // loaded until the replacement native init commits.
        assertEquals(Arrays.asList(LocalTtsEngine.State.LOADING), harness.listener.states);
        assertEquals(new HashSet<>(Arrays.asList(EN)), harness.loaded());
        assertFalse(capture.succeeded());
        assertTrue(capture.errors.isEmpty());

        harness.scheduler.runAllWorker();
        assertEquals(new HashSet<>(Arrays.asList(FR)), harness.loaded());
        assertTrue(capture.succeeded());
        assertEquals(new HashSet<>(Arrays.asList(FR)), capture.successes.get(0));

        harness.scheduler.runAllMain();
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.READY),
                harness.listener.states);
        assertEquals(Arrays.asList(EN, FR), harness.nativeApi.initCalls);
        assertEquals(1, harness.nativeApi.releaseCount);
    }

    @Test
    public void installedVoicesAreNotLoadedUntilACommittedReload() {
        harness.assets.install(FR);
        harness.assets.install(ES);
        harness.initializeReady();

        assertEquals(new HashSet<>(Arrays.asList(EN)), harness.loaded());
        assertEquals(new HashSet<>(Arrays.asList(EN, FR, ES)),
                harness.engine.installedOptionalVoices());
    }

    @Test
    public void anInstalledButUnloadedVoiceIsNeverSubstitutedWithEnglish() {
        harness.assets.install(FR);
        harness.initializeReady();
        harness.listener.clear();

        harness.engine.speak("bonjour", "fr-FR", null);
        harness.scheduler.drain();

        assertEquals(Arrays.asList("voice-not-loaded"), harness.listener.errors);
        assertTrue("no synthesis may start for a voice that is not loaded",
                harness.nativeApi.streamStartCalls == 0);
        assertTrue(harness.nativeApi.initCalls.equals(Arrays.asList(EN)));
    }

    @Test
    public void afterLoadingFrenchEnglishIsNotLoadedAndFailsClosed() {
        harness.assets.install(FR);
        harness.initializeReady();
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();
        harness.engine.registerVoice(FR, capture);
        harness.scheduler.drain();
        assertTrue(capture.succeeded());
        assertEquals(new HashSet<>(Arrays.asList(FR)), harness.loaded());
        harness.listener.clear();

        harness.engine.speak("hello", "en-GB", null);
        harness.scheduler.drain();

        assertEquals(Arrays.asList("voice-not-loaded"), harness.listener.errors);
        assertTrue(harness.nativeApi.streamStartCalls == 0);
    }

    @Test
    public void registrationOfAMissingVoiceFailsBeforeAnyStateChange() {
        harness.initializeReady();
        harness.assets.remove(ES);
        harness.listener.clear();
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(ES, capture);
        harness.scheduler.drain();

        assertEquals("voice-not-installed", capture.lastError());
        assertTrue(harness.listener.states.isEmpty());
        assertEquals(Arrays.asList(EN), harness.nativeApi.initCalls);
        assertTrue(harness.scheduler.pendingWorker() == 0);
    }

    @Test
    public void failedReloadRestoresThePreviouslyWorkingVoice() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.nativeApi.failVoice(FR);
        harness.listener.clear();
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, capture);
        harness.scheduler.drain();

        assertEquals("reload-failed", capture.lastError());
        assertFalse(capture.succeeded());
        assertEquals(new HashSet<>(Arrays.asList(EN)), harness.loaded());
        assertEquals(Arrays.asList(
                LocalTtsEngine.State.LOADING, LocalTtsEngine.State.READY),
                harness.listener.states);
        assertEquals(Arrays.asList(EN, FR, EN), harness.nativeApi.initCalls);
        assertTrue(EngineOwnership.owns(EngineOwnership.currentGeneration()));
    }

    @Test
    public void unrecoverableReloadEndsInErrorAndOwnsNoEngine() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.nativeApi.failAll = true;
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
    }

    @Test
    public void registrationIsRejectedWhileAReloadIsInFlight() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.assets.install(ES);
        KokoroEngineTestSupport.Capture first = new KokoroEngineTestSupport.Capture();
        KokoroEngineTestSupport.Capture second = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, first);
        harness.engine.registerVoice(ES, second);

        assertEquals("operation-conflict", second.lastError());
        assertTrue(first.errors.isEmpty());
        assertEquals(1, harness.scheduler.pendingWorker());

        harness.scheduler.drain();
        assertTrue(first.succeeded());
        assertEquals(new HashSet<>(Arrays.asList(FR)), harness.loaded());
    }

    @Test
    public void speakDuringReloadIsRejected() {
        harness.initializeReady();
        harness.assets.install(FR);
        harness.engine.registerVoice(FR, new KokoroEngineTestSupport.Capture());
        harness.listener.clear();

        harness.engine.speak("bonjour", "fr-FR", null);
        harness.scheduler.runAllMain();

        assertEquals(Arrays.asList("engine not ready"), harness.listener.errors);
        assertEquals(Arrays.asList(LocalTtsEngine.State.LOADING), harness.listener.states);
    }

    @Test
    public void aSecondInitializationIsRejectedWithoutTouchingTheReadyEngine() {
        harness.initializeReady();
        harness.listener.clear();

        harness.engine.initialize(harness.listener);
        harness.scheduler.drain();

        assertEquals(Arrays.asList("operation-conflict"), harness.listener.errors);
        assertEquals(Arrays.asList(EN), harness.nativeApi.initCalls);
        assertEquals(new HashSet<>(Arrays.asList(EN)), harness.loaded());
    }

    @Test
    public void shutdownMovesTheStateMachineToUninitializedAndLoadsNothing() {
        harness.initializeReady();
        harness.listener.clear();

        harness.engine.shutdown();
        harness.scheduler.drain();

        assertEquals(Arrays.asList(LocalTtsEngine.State.UNINITIALIZED), harness.listener.states);
        assertTrue(harness.engine.loadedVoices().isEmpty());
        assertEquals(1, harness.nativeApi.releaseCount);
        assertFalse(harness.engine.isSpeaking());
    }

    @Test
    public void registrationAfterShutdownFailsClosed() {
        harness.initializeReady();
        harness.engine.shutdown();
        harness.scheduler.drain();
        harness.listener.clear();
        harness.assets.install(FR);
        KokoroEngineTestSupport.Capture capture = new KokoroEngineTestSupport.Capture();

        harness.engine.registerVoice(FR, capture);
        harness.scheduler.drain();

        assertEquals("engine-shutdown", capture.lastError());
        assertTrue(harness.listener.states.isEmpty());
    }
}
