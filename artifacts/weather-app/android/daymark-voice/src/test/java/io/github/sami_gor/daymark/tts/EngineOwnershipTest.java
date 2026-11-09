package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.atomic.AtomicInteger;

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
    public void aReservationRevokesTheIncumbentBeforeItsNativeInitRuns() {
        long first = EngineOwnership.beginInit();
        EngineOwnership.commitInit(first);

        // F2: the replacement reserves but its native init has not run (and may
        // never succeed). The incumbent must not look like an owner for the
        // whole beginInit -> commitInit window.
        long replacement = EngineOwnership.beginInit();
        assertFalse("the incumbent is revoked by the reservation itself",
                EngineOwnership.owns(first));
        assertFalse(EngineOwnership.owns(replacement));
        assertTrue(EngineOwnership.isLatestReservation(replacement));
        assertFalse(EngineOwnership.isAuthoritative(first));

        // A stale commit can never roll ownership back.
        assertFalse(EngineOwnership.commitInit(first));
        assertTrue(EngineOwnership.commitInit(replacement));
        assertTrue(EngineOwnership.owns(replacement));
        assertFalse(EngineOwnership.owns(first));
    }

    @Test
    public void anUncommittedReplacementDoesNotStealTheReleaseClaim() {
        long first = EngineOwnership.beginInit();
        EngineOwnership.commitInit(first);
        EngineOwnership.beginInit(); // replacement reserved, native init pending

        // The old native engine is still installed, so the old instance must
        // still be able to release it; the replacement has not committed yet.
        assertTrue(EngineOwnership.claimRelease(first));
        assertFalse(EngineOwnership.claimRelease(first));
    }

    @Test
    public void streamTokensAreInvalidatedByTheNextInitialisationEpoch() {
        long first = EngineOwnership.beginInit();
        EngineOwnership.commitInit(first);
        long firstStream = EngineOwnership.openStream(first);
        assertTrue(EngineOwnership.isStreamCurrent(first, firstStream));

        long second = EngineOwnership.beginInit();
        assertFalse("a new init epoch invalidates every older stream token",
                EngineOwnership.isStreamCurrent(first, firstStream));
        EngineOwnership.commitInit(second);

        long secondStream = EngineOwnership.openStream(second);
        assertTrue(EngineOwnership.isStreamCurrent(second, secondStream));
        assertFalse("a stale operation may not clear the newer stream",
                EngineOwnership.closeStream(first, firstStream));
        assertTrue(EngineOwnership.isStreamCurrent(second, secondStream));
        assertTrue(EngineOwnership.closeStream(second, secondStream));
        assertFalse(EngineOwnership.isStreamCurrent(second, secondStream));
    }

    @Test
    public void releaseUnconfirmedIsStickyAndBlocksNewOperations() {
        long generation = EngineOwnership.beginInit();
        EngineOwnership.commitInit(generation);
        assertTrue(EngineOwnership.beginOperation(generation));
        Runnable none = EngineOwnership.endOperation();
        if (none != null) {
            none.run();
        }

        EngineOwnership.markReleaseUnconfirmed();
        assertTrue(EngineOwnership.isReleaseUnconfirmed());
        assertEquals(EngineOwnership.REASON_RELEASE_UNCONFIRMED,
                EngineOwnership.releaseUnconfirmedReason());
        assertFalse("no new native operation may be admitted",
                EngineOwnership.beginOperation(generation));

        EngineOwnership.resetForTest();
        assertFalse(EngineOwnership.isReleaseUnconfirmed());
    }

    @Test
    public void drainWaitsForTheLastOperationBeforeRunningTheTransition() {
        long generation = EngineOwnership.beginInit();
        EngineOwnership.commitInit(generation);
        assertTrue(EngineOwnership.beginOperation(generation));

        final AtomicInteger runs = new AtomicInteger();
        Runnable transition = () -> runs.incrementAndGet();
        assertFalse("the transition must be deferred while an operation is active",
                EngineOwnership.awaitDrain(transition));
        assertEquals(0, runs.get());

        Runnable runner = EngineOwnership.endOperation();
        assertNotNull("the last operation must hand back the drain runner", runner);
        runner.run();
        assertEquals(1, runs.get());
        assertTrue("with no operation active the next transition may proceed",
                EngineOwnership.awaitDrain(() -> { }));
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

    @Test
    public void onlyTheNewestReservationMayTouchTheNativeEngine() {
        EngineOwnership.resetForTest();
        long first = EngineOwnership.beginInit();
        org.junit.Assert.assertTrue(EngineOwnership.isLatestReservation(first));
        long second = EngineOwnership.beginInit();
        org.junit.Assert.assertFalse("a slow older initialisation must abort before native init",
                EngineOwnership.isLatestReservation(first));
        org.junit.Assert.assertTrue(EngineOwnership.isLatestReservation(second));
        org.junit.Assert.assertFalse(EngineOwnership.isLatestReservation(0));
        org.junit.Assert.assertFalse(EngineOwnership.isLatestReservation(-1));
    }

    @Test
    public void resetClearsReservationsAsWellAsOwnership() {
        long committed = EngineOwnership.beginInit();
        org.junit.Assert.assertTrue(EngineOwnership.commitInit(committed));
        EngineOwnership.beginInit();

        EngineOwnership.resetForTest();

        org.junit.Assert.assertEquals(0L, EngineOwnership.currentGeneration());
        org.junit.Assert.assertEquals(0L, EngineOwnership.reservedGeneration());
        long next = EngineOwnership.beginInit();
        org.junit.Assert.assertEquals(1L, next);
    }
}
