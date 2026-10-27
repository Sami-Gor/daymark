package io.github.sami_gor.daymark.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.ImageButton;
import android.widget.ListView;
import android.widget.TextView;

import io.github.sami_gor.daymark.R;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Per-instance widget statistics configuration. */
public final class WeatherWidgetConfigureActivity extends Activity {
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private final List<WidgetStat> order =
            new ArrayList<>(Arrays.asList(WidgetStat.values()));
    private final Set<WidgetStat> selected = new HashSet<>();
    private ConfigAdapter adapter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        setContentView(R.layout.widget_configure);

        Bundle extras = getIntent().getExtras();
        if (extras != null) {
            appWidgetId = extras.getInt(
                    AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        List<WidgetStat> saved = WidgetConfigStore.getStats(this, appWidgetId);
        selected.addAll(saved);
        // Keep the saved priority order at the top; append any unselected stats
        // so every statistic remains available for selection.
        order.clear();
        order.addAll(saved);
        for (WidgetStat stat : WidgetStat.values()) {
            if (!order.contains(stat)) {
                order.add(stat);
            }
        }
        adapter = new ConfigAdapter();
        ListView list = findViewById(R.id.widget_config_list);
        list.setAdapter(adapter);

        Button save = findViewById(R.id.widget_config_save);
        Button cancel = findViewById(R.id.widget_config_cancel);
        save.setOnClickListener(view -> save());
        cancel.setOnClickListener(view -> finish());
    }

    private void save() {
        List<WidgetStat> chosen = new ArrayList<>();
        for (WidgetStat stat : order) {
            if (selected.contains(stat)) {
                chosen.add(stat);
            }
        }
        WidgetConfigStore.setStats(this, appWidgetId, chosen);
        AppWidgetManager manager = AppWidgetManager.getInstance(this);
        WeatherWidgetProvider.updateWidget(this, manager, appWidgetId);
        WidgetScheduler.ensurePeriodic(this);
        WidgetScheduler.requestImmediate(this);

        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    private final class ConfigAdapter extends BaseAdapter {
        @Override
        public int getCount() {
            return order.size();
        }

        @Override
        public WidgetStat getItem(int position) {
            return order.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            View view = convertView;
            if (view == null) {
                view = LayoutInflater.from(WeatherWidgetConfigureActivity.this)
                        .inflate(R.layout.widget_configure_row, parent, false);
            }
            WidgetStat stat = getItem(position);
            CheckBox check = view.findViewById(R.id.widget_config_check);
            TextView label = view.findViewById(R.id.widget_config_label);
            ImageButton up = view.findViewById(R.id.widget_config_up);
            ImageButton down = view.findViewById(R.id.widget_config_down);

            check.setOnCheckedChangeListener(null);
            check.setChecked(selected.contains(stat));
            label.setText(stat.label());
            check.setOnCheckedChangeListener((button, checked) -> {
                if (checked) {
                    selected.add(stat);
                } else {
                    selected.remove(stat);
                }
            });

            up.setEnabled(position > 0);
            down.setEnabled(position < order.size() - 1);
            up.setAlpha(position > 0 ? 1f : 0.3f);
            down.setAlpha(position < order.size() - 1 ? 1f : 0.3f);
            up.setOnClickListener(view1 -> move(position, -1));
            down.setOnClickListener(view1 -> move(position, 1));
            return view;
        }
    }

    private void move(int position, int delta) {
        int target = position + delta;
        if (target < 0 || target >= order.size()) {
            return;
        }
        WidgetStat stat = order.remove(position);
        order.add(target, stat);
        adapter.notifyDataSetChanged();
    }
}
