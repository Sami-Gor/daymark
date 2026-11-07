package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Before;
import org.junit.Test;

public class EngineOwnershipTest {

    @Before
    public void setUp() {
        EngineOwnership.resetForTest();
    }

    @Test
    public void releaseOnlyHappensOnce() {
        long generation = EngineOwnership.beginInit();
        assertTrue(EngineOwnership.claimRelease(generation));
        assertFalse(EngineOwnership.claimRelease(generation));
    }

    @Test
    public void staleReleaseCannotTakeTheReplacementEngine() {
        long first = EngineOwnership.beginInit();
        long second = EngineOwnership.beginInit(); // Activity recreated
        assertFalse(EngineOwnership.claimRelease(first));
        assertTrue(EngineOwnership.owns(second));
        assertTrue(EngineOwnership.claimRelease(second));
    }

    @Test
    public void repeatedInitAdvancesOwnership() {
        long a = EngineOwnership.beginInit();
        long b = EngineOwnership.beginInit();
        assertFalse(EngineOwnership.owns(a));
        assertTrue(EngineOwnership.owns(b));
    }
}
