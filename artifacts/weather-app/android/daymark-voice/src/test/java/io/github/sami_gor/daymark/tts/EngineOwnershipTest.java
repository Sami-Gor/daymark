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

    @Test
    public void concurrentReservationsReceiveDistinctGenerations() {
        EngineOwnership.resetForTest();
        long first = EngineOwnership.beginInit();
        long second = EngineOwnership.beginInit();
        org.junit.Assert.assertNotEquals(first, second);
        // The slow first initialisation must not be able to commit.
        org.junit.Assert.assertFalse(EngineOwnership.commitInit(first));
        org.junit.Assert.assertTrue(EngineOwnership.commitInit(second));
        org.junit.Assert.assertTrue(EngineOwnership.owns(second));
        org.junit.Assert.assertFalse(EngineOwnership.owns(first));
        org.junit.Assert.assertFalse(EngineOwnership.claimRelease(first));
        org.junit.Assert.assertTrue(EngineOwnership.claimRelease(second));
    }

    @Test
    public void aStaleCommitCannotRollOwnershipBackwards() {
        EngineOwnership.resetForTest();
        long oldToken = EngineOwnership.beginInit();
        long newToken = EngineOwnership.beginInit();
        org.junit.Assert.assertTrue(EngineOwnership.commitInit(newToken));
        org.junit.Assert.assertFalse(EngineOwnership.commitInit(oldToken));
        org.junit.Assert.assertEquals(newToken, EngineOwnership.currentGeneration());
    }
}
