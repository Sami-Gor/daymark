package io.github.sami_gor.daymark.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Arrays;
import java.util.List;

public class WidgetStatTest {
    @Test
    public void defaultsContainEveryUserStatisticAndKeepPriority() {
        List<WidgetStat> defaults = WidgetStat.defaults();
        assertTrue(defaults.contains(WidgetStat.TEMPERATURE));
        assertTrue(defaults.contains(WidgetStat.HOURLY));
        assertEquals(WidgetStat.TEMPERATURE, defaults.get(0));
        assertEquals(8, defaults.size());
    }

    @Test
    public void serializationRoundTripsOrderAndRemovesDuplicates() {
        List<WidgetStat> ordered = Arrays.asList(
                WidgetStat.WIND, WidgetStat.TEMPERATURE, WidgetStat.SUN, WidgetStat.WIND);
        String serialized = WidgetStat.serialize(ordered);
        assertEquals("wind,temperature,sun", serialized);
        assertEquals(Arrays.asList(WidgetStat.WIND, WidgetStat.TEMPERATURE, WidgetStat.SUN),
                WidgetStat.parse(serialized));
    }

    @Test
    public void allTwelveStatisticsCanBeSelected() {
        List<WidgetStat> all = Arrays.asList(WidgetStat.values());
        assertEquals(12, all.size());
        assertEquals(all, WidgetStat.parse(WidgetStat.serialize(all)));
    }

    @Test
    public void emptySelectionIsPreserved() {
        assertTrue(WidgetStat.parse("").isEmpty());
    }

    @Test
    public void unknownAndDuplicateTokensAreIgnored() {
        List<WidgetStat> parsed = WidgetStat.parse("temperature,nope,wind,temperature");
        assertEquals(Arrays.asList(WidgetStat.TEMPERATURE, WidgetStat.WIND), parsed);
        assertFalse(parsed.contains(null));
    }
}
