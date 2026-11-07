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
        EngineOwnership.commitInit(generation);
        assertTrue(EngineOwnership.claimRelease(generation));
        assertFalse(EngineOwnership.claimRelease(generation));
    }

    @Test
    public void staleReleaseCannotTakeTheReplacementEngine() {
        long first = EngineOwnership.beginInit();
        EngineOwnership.commitInit(first);
        long second = EngineOwnership.beginInit();
        EngineOwnership.commitInit(second); // Activity recreated, init succeeded
        assertFalse(EngineOwnership.claimRelease(first));
        assertTrue(EngineOwnership.owns(second));
        assertTrue(EngineOwnership.claimRelease(second));
    }

    @Test
    public void failedReplacementInitLeavesThePreviousOwnerInPlace() {
        long first = EngineOwnership.beginInit();
        EngineOwnership.commitInit(first);
        long replacement = EngineOwnership.beginInit(); // native init never succeeds
        assertFalse(EngineOwnership.owns(replacement));
        assertTrue(EngineOwnership.owns(first));
        assertTrue(EngineOwnership.claimRelease(first));
    }

    @Test
    public void repeatedInitAdvancesOwnership() {
        long a = EngineOwnership.beginInit();
        EngineOwnership.commitInit(a);
        long b = EngineOwnership.beginInit();
        EngineOwnership.commitInit(b);
        assertFalse(EngineOwnership.owns(a));
        assertTrue(EngineOwnership.owns(b));
    }
}
