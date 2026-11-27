package io.github.sami_gor.daymark.tts;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PlaybackGenerationTest {

    @Test
    public void onlyTheNewestStartIsCurrent() {
        PlaybackGeneration generation = new PlaybackGeneration();
        int first = generation.begin();
        assertTrue(generation.isCurrent(first));

        int second = generation.begin();
        assertFalse(generation.isCurrent(first));
        assertTrue(generation.isCurrent(second));
    }

    @Test
    public void stopInvalidatesTheCurrentSession() {
        PlaybackGeneration generation = new PlaybackGeneration();
        int current = generation.begin();
        generation.invalidate();

        assertFalse(generation.isCurrent(current));
        int next = generation.begin();
        assertTrue(generation.isCurrent(next));
        assertFalse(generation.isCurrent(current));
    }

    @Test
    public void staleWorkersCanNeverBecomeCurrentAgain() {
        PlaybackGeneration generation = new PlaybackGeneration();
        int stale = generation.begin();
        generation.begin();
        generation.invalidate();
        generation.begin();

        assertFalse(generation.isCurrent(stale));
    }
}
