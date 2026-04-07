import { useEffect, useMemo, useRef, useState } from "react";
import GridLayout, { type Layout, type LayoutItem } from "react-grid-layout";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import BreakdownTable from "../components/BreakdownTable";
import ContributionHeatmap from "../components/ContributionHeatmap";
import CoreMetricsPanel from "../components/CoreMetricsPanel";
import FilterBar from "../components/FilterBar";
import FilterDrawer from "../components/FilterDrawer";
import Panel from "../components/Panel";
import SourceHealthPanel from "../components/SourceHealthPanel";
import {
  type BreakdownRow,
  type TimelineBucket,
  type UsageFilter,
  fetchContributions,
  fetchFilterOptions,
  fetchModelsBreakdown,
  fetchOverview,
  fetchSources,
  fetchSourcesBreakdown,
  fetchTimeline,
  filterToQuery,
  refreshData,
} from "../lib/api";
import {
  DASHBOARD_GRID_COLUMNS,
  DASHBOARD_GRID_CONTAINER_PADDING,
  DASHBOARD_GRID_MARGIN,
  DASHBOARD_GRID_ROW_HEIGHT,
  DASHBOARD_CARD_ORDER,
  clearDashboardLayout,
  defaultDashboardLayout,
  gridRowsForPixelHeight,
  isCustomDashboardLayout,
  isFixedDashboardCard,
  loadDashboardLayout,
  normalizeDashboardLayout,
  saveDashboardLayout,
  type DashboardCardId,
} from "../lib/dashboardLayout";
import { ReactECharts, echarts } from "../lib/echarts";
import {
  formatCompactNumber,
  formatCompactUsd,
  formatDate,
  formatUsd,
} from "../lib/format";
import { defaultFilter, mergeFilter, parseFilter } from "../lib/filters";
import {
  loadHeatmapCycleSettings,
  normalizeHeatmapCycleSettings,
  saveHeatmapCycleSettings,
  type HeatmapCycleSettings,
} from "../lib/heatmapCycles";
import { useLocale } from "../lib/i18n";
import { chartPalette, useTheme } from "../lib/theme";
import { useRefreshStream } from "../lib/useRefreshStream";

type TrendMetric = "tokens" | "cost" | "dual";

type DashboardPageProps = {
  filterPinned: boolean;
  mastheadCollapsed: boolean;
  inlineDockTools: boolean;
  onToggleFilterPinned: () => void;
  onScrollTop: () => void;
};

export default function DashboardPage({
  filterPinned,
  mastheadCollapsed,
  inlineDockTools,
  onToggleFilterPinned,
  onScrollTop,
}: DashboardPageProps) {
  const { locale, t } = useLocale();
  const { theme, layoutTheme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [timelineBucket, setTimelineBucket] = useState<TimelineBucket>("daily");
  const [timelineMetric, setTimelineMetric] = useState<TrendMetric>("tokens");
  const [cycleSettings, setCycleSettings] = useState<HeatmapCycleSettings>(() =>
    loadHeatmapCycleSettings(),
  );
  const [cardLayout, setCardLayout] = useState<LayoutItem[]>(() =>
    loadDashboardLayout(layoutTheme) ?? defaultDashboardLayout(layoutTheme),
  );
  const dashboardWrapRef = useRef<HTMLDivElement | null>(null);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const filterShellRef = useRef<HTMLDivElement | null>(null);
  const heatmapPanelRef = useRef<HTMLElement | null>(null);
  const heatmapBodyRef = useRef<HTMLDivElement | null>(null);
  const healthPanelRef = useRef<HTMLElement | null>(null);
  const healthBodyRef = useRef<HTMLDivElement | null>(null);
  const [dashboardWidth, setDashboardWidth] = useState(1320);
  const [chartWidth, setChartWidth] = useState(860);
  const [gridResizing, setGridResizing] = useState(false);
  const [heatmapContentHeight, setHeatmapContentHeight] = useState(0);
  const [heatmapPanelChromeHeight, setHeatmapPanelChromeHeight] = useState(0);
  const [healthContentHeight, setHealthContentHeight] = useState(0);
  const [healthPanelChromeHeight, setHealthPanelChromeHeight] = useState(0);
  const [filterBounds, setFilterBounds] = useState({
    left: 0,
    width: 0,
    height: 0,
  });
  const canEditLayout = dashboardWidth >= 1024;

  const filter = useMemo(
    () => mergeFilter(defaultFilter, parseFilter(searchParams)),
    [searchParams],
  );
  const palette = chartPalette(theme);
  const filterPinnedActive = filterPinned && mastheadCollapsed;

  useRefreshStream();

  useEffect(() => {
    setCardLayout(loadDashboardLayout(layoutTheme) ?? defaultDashboardLayout(layoutTheme));
  }, [layoutTheme]);

  useEffect(() => {
    const element = dashboardWrapRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    setDashboardWidth(element.clientWidth || 1320);
    const observer = new ResizeObserver((entries) => {
      const next = entries.at(0)?.contentRect.width;
      if (next && next > 0) {
        setDashboardWidth(next);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = chartWrapRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const next = entries.at(0)?.contentRect.width;
      if (next && next > 0) {
        setChartWidth(next);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = filterShellRef.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setFilterBounds({
        left: rect.left,
        width: rect.width,
        height: element.offsetHeight,
      });
    };

    update();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => update());
    resizeObserver?.observe(element);
    window.addEventListener("resize", update);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const panel = heatmapPanelRef.current;
    const body = heatmapBodyRef.current;
    if (!panel || !body) {
      return;
    }

    const update = () => {
      const next = Math.max(0, panel.offsetHeight - body.clientHeight);
      setHeatmapPanelChromeHeight((previous) => (previous === next ? previous : next));
    };

    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => update());
    observer.observe(panel);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const panel = healthPanelRef.current;
    const body = healthBodyRef.current;
    if (!panel || !body) {
      return;
    }

    const update = () => {
      const next = Math.max(0, panel.offsetHeight - body.clientHeight);
      setHealthPanelChromeHeight((previous) => (previous === next ? previous : next));
    };

    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => update());
    observer.observe(panel);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  const normalizedLayout = useMemo(
    () => normalizeDashboardLayout(layoutTheme, cardLayout),
    [cardLayout, layoutTheme],
  );
  const heatmapDisplayRows = useMemo(() => {
    if (heatmapContentHeight <= 0 || heatmapPanelChromeHeight <= 0) {
      return 0;
    }
    return gridRowsForPixelHeight(heatmapContentHeight + heatmapPanelChromeHeight);
  }, [heatmapContentHeight, heatmapPanelChromeHeight]);
  const healthDisplayRows = useMemo(() => {
    if (healthContentHeight <= 0 || healthPanelChromeHeight <= 0) {
      return 0;
    }
    return gridRowsForPixelHeight(healthContentHeight + healthPanelChromeHeight);
  }, [healthContentHeight, healthPanelChromeHeight]);
  const runtimeRowOverrides = useMemo<Partial<Record<DashboardCardId, number>>>(
    () =>
      gridResizing
        ? {}
        : {
            heatmap: heatmapDisplayRows,
            health: healthDisplayRows,
          },
    [gridResizing, healthDisplayRows, heatmapDisplayRows],
  );
  const displayLayout = useMemo(
    () =>
      normalizedLayout.map((item) => {
        const runtimeRows = runtimeRowOverrides[item.i as DashboardCardId] ?? 0;
        if (runtimeRows <= 0) {
          return item;
        }
        return { ...item, h: Math.max(item.h, runtimeRows) };
      }),
    [normalizedLayout, runtimeRowOverrides],
  );
  const layoutCustomized = useMemo(
    () => isCustomDashboardLayout(layoutTheme, normalizedLayout),
    [layoutTheme, normalizedLayout],
  );

  const overviewQuery = useQuery({
    queryKey: ["overview", filter],
    queryFn: () => fetchOverview(filter),
  });
  const modelQuery = useQuery({
    queryKey: ["models", filter],
    queryFn: () => fetchModelsBreakdown(filter),
  });
  const modelFilterSeed = useMemo(
    () => ({ ...filter, models: [] }),
    [filter],
  );
  const modelFilterOptionsQuery = useQuery({
    queryKey: ["models-filter-options", modelFilterSeed],
    queryFn: () => fetchModelsBreakdown(modelFilterSeed),
  });
  const sourceQuery = useQuery({
    queryKey: ["sources-breakdown", filter],
    queryFn: () => fetchSourcesBreakdown(filter),
  });
  const timelineQuery = useQuery({
    queryKey: ["timeline", filter, timelineBucket],
    queryFn: () => fetchTimeline(filter, timelineBucket),
  });
  const contributionQuery = useQuery({
    queryKey: ["contributions", filter],
    queryFn: () => fetchContributions(filter),
  });
  const optionsQuery = useQuery({
    queryKey: ["filter-options"],
    queryFn: fetchFilterOptions,
  });
  const sourceStatusQuery = useQuery({
    queryKey: ["source-status"],
    queryFn: fetchSources,
  });

  const overview = overviewQuery.data;
  const timeline = timelineQuery.data ?? [];
  const modelRows = modelQuery.data ?? [];
  const sourceRows = sourceQuery.data ?? [];
  const sourceStatus = sourceStatusQuery.data ?? [];
  const tokenModelOptions = useMemo(
    () => buildTokenModelOptions(modelFilterOptionsQuery.data ?? [], filter.models),
    [filter.models, modelFilterOptionsQuery.data],
  );
  const activeFilterCount = useMemo(() => countActiveFilters(filter), [filter]);

  const timelineLabels = timeline.map((item) =>
    formatBucketLabel(item.bucket_start, timelineBucket, locale),
  );
  const timelineStep = computeTimelineAxisStep(timeline.length, chartWidth, timelineBucket);
  const visibleXAxisIndexes = new Set<number>();
  for (let index = 0; index < timeline.length; index += timelineStep) {
    visibleXAxisIndexes.add(index);
  }
  if (timeline.length > 0) {
    visibleXAxisIndexes.add(0);
    visibleXAxisIndexes.add(timeline.length - 1);
  }

  const lineOption = {
    grid: { left: 72, right: 24, top: 24, bottom: 32, containLabel: true },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params : [params];
        const typedRows = rows as Array<{
          axisValueLabel?: string;
          seriesName?: string;
          marker?: string;
          data?: number;
        }>;
        const label = typedRows[0]?.axisValueLabel ?? "";
        const body = typedRows
          .map((row) => {
            const value = Number(row.data ?? 0);
            const display =
              row.seriesName === t("trend.series.cost")
                ? formatUsd(value, locale)
                : formatCompactNumber(value);
            return `${row.marker ?? ""}${row.seriesName ?? ""}: ${display}`;
          })
          .join("<br/>");
        return `${label}<br/>${body}`;
      },
    },
    xAxis: {
      type: "category",
      data: timelineLabels,
      axisLabel: {
        color: palette.axis,
        formatter: (value: string, index: number) =>
          visibleXAxisIndexes.has(index) ? value : "",
      },
    },
    yAxis:
      timelineMetric === "dual"
        ? [
            {
              type: "value",
              name: t("trend.series.tokens"),
              axisLabel: {
                color: palette.axis,
                margin: 12,
                formatter: (value: number) => formatCompactNumber(value),
              },
              splitLine: { lineStyle: { color: palette.splitLine } },
            },
            {
              type: "value",
              name: t("trend.series.cost"),
              axisLabel: {
                color: palette.axisAccent,
                margin: 12,
                formatter: (value: number) => formatCompactUsd(value),
              },
              splitLine: { show: false },
            },
          ]
        : {
            type: "value",
            axisLabel: {
              color: palette.axis,
              margin: 12,
              formatter: (value: number) =>
                timelineMetric === "cost"
                  ? formatCompactUsd(value)
                  : formatCompactNumber(value),
            },
            splitLine: { lineStyle: { color: palette.splitLine } },
          },
    series: [
      ...(timelineMetric === "cost"
        ? []
        : [
            {
              name: t("trend.series.tokens"),
              type: "line",
              smooth: true,
              data: timeline.map((item) => item.total_tokens),
              yAxisIndex: timelineMetric === "dual" ? 0 : undefined,
              lineStyle: { color: palette.tokenLine, width: 3 },
              itemStyle: { color: palette.tokenLine },
              areaStyle: {
                color: palette.tokenArea,
              },
            },
          ]),
      ...(timelineMetric === "tokens"
        ? []
        : [
            {
              name: t("trend.series.cost"),
              type: "line",
              smooth: true,
              data: timeline.map((item) => item.total_cost_usd),
              yAxisIndex: timelineMetric === "dual" ? 1 : undefined,
              lineStyle: { color: palette.costLine, width: 3 },
              itemStyle: { color: palette.costLine },
              areaStyle: timelineMetric === "cost" ? { color: palette.costArea } : undefined,
            },
          ]),
    ],
  };

  const sourcePie = {
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        radius: ["45%", "72%"],
        label: { color: palette.pieLabel },
        data: sourceRows.slice(0, 8).map((row) => ({
          name: row.label,
          value: row.total_tokens,
        })),
      },
    ],
  };

  const onFilterChange = (next: typeof filter) => {
    setSearchParams(filterToQuery(next), { replace: true });
  };

  const onFilterClear = () => {
    onFilterChange({
      ...defaultFilter,
      timezone: filter.timezone,
      excludeArchived: false,
    });
  };

  const onCycleSettingsChange = (next: HeatmapCycleSettings) => {
    const normalized = normalizeHeatmapCycleSettings(next);
    setCycleSettings(normalized);
    saveHeatmapCycleSettings(normalized);
  };

  const onLayoutChange = (nextLayout: Layout) => {
    const persistedLayout = nextLayout.map((item) => {
      const cardId = item.i as DashboardCardId;
      const runtimeRows = runtimeRowOverrides[cardId] ?? 0;
      if (runtimeRows <= 0) {
        return item;
      }

      const base = normalizedLayout.find((entry) => entry.i === cardId);
      const displayed = displayLayout.find((entry) => entry.i === cardId);
      if (!base || !displayed || displayed.h <= base.h || item.h !== displayed.h) {
        return item;
      }

      return {
        ...item,
        h: base.h,
      };
    });
    const normalized = normalizeDashboardLayout(layoutTheme, persistedLayout);
    if (isSameLayout(normalizedLayout, normalized)) {
      return;
    }
    setCardLayout(normalized);
    saveDashboardLayout(layoutTheme, normalized);
  };

  const onLayoutReset = () => {
    clearDashboardLayout(layoutTheme);
    setCardLayout(defaultDashboardLayout(layoutTheme));
  };

  const exportQuery = filterToQuery(filter).toString();
  const exportBase = `/api/export/events.json?${exportQuery}`;
  const exportCsv = `/api/export/events.csv?${exportQuery}`;
  const exportJsonName = "token-insight-events.json";
  const exportCsvName = "token-insight-events.csv";

  const renderCard = (cardId: DashboardCardId) => {
    switch (cardId) {
      case "trend":
        return (
          <Panel
            title={t("panel.trend.title")}
            subtitle={t("panel.trend.subtitle", {
              bucket: timelineLabel(timelineBucket, t),
              metric: timelineMetricLabel(timelineMetric, t),
            })}
            actions={
              <div className="panel-actions">
                <div
                  className="button-group timeline-switch"
                  role="group"
                  aria-label={t("trend.aria.bucket")}
                >
                  <button
                    className={timelineBucket === "daily" ? "timeline-button active" : "timeline-button"}
                    aria-pressed={timelineBucket === "daily"}
                    onClick={() => setTimelineBucket("daily")}
                  >
                    {t("trend.bucket.dailyShort")}
                  </button>
                  <button
                    className={timelineBucket === "hourly" ? "timeline-button active" : "timeline-button"}
                    aria-pressed={timelineBucket === "hourly"}
                    onClick={() => setTimelineBucket("hourly")}
                  >
                    {t("trend.bucket.hourlyShort")}
                  </button>
                  <button
                    className={timelineBucket === "minutely" ? "timeline-button active" : "timeline-button"}
                    aria-pressed={timelineBucket === "minutely"}
                    onClick={() => setTimelineBucket("minutely")}
                  >
                    {t("trend.bucket.minutelyShort")}
                  </button>
                </div>
                <div
                  className="button-group timeline-switch"
                  role="group"
                  aria-label={t("trend.aria.metric")}
                >
                  <button
                    className={timelineMetric === "tokens" ? "timeline-button active" : "timeline-button"}
                    aria-pressed={timelineMetric === "tokens"}
                    onClick={() => setTimelineMetric("tokens")}
                  >
                    {t("trend.metric.tokens")}
                  </button>
                  <button
                    className={timelineMetric === "cost" ? "timeline-button active" : "timeline-button"}
                    aria-pressed={timelineMetric === "cost"}
                    onClick={() => setTimelineMetric("cost")}
                  >
                    {t("trend.metric.cost")}
                  </button>
                  <button
                    className={timelineMetric === "dual" ? "timeline-button active" : "timeline-button"}
                    aria-pressed={timelineMetric === "dual"}
                    onClick={() => setTimelineMetric("dual")}
                  >
                    {t("trend.metric.dualShort")}
                  </button>
                </div>
                <a className="button ghost panel-ghost" href={exportBase} download={exportJsonName}>
                  {t("trend.exportJson")}
                </a>
                <a className="button ghost panel-ghost" href={exportCsv} download={exportCsvName}>
                  {t("trend.exportCsv")}
                </a>
              </div>
            }
          >
            <div ref={chartWrapRef}>
              <ReactECharts
                echarts={echarts}
                option={lineOption}
                style={{ height: 320 }}
                notMerge
              />
            </div>
          </Panel>
        );
      case "metrics":
        return (
          <Panel
            title={t("panel.metrics.title")}
            subtitle={t("panel.metrics.subtitle")}
            bodyClassName="core-metrics-panel-body"
          >
            <CoreMetricsPanel stats={overview} />
          </Panel>
        );
      case "heatmap":
        return (
          <Panel
            title={t("panel.heatmap.title")}
            subtitle={t("panel.heatmap.subtitle")}
            bodyClassName="heatmap-panel-body"
            panelRef={heatmapPanelRef}
            bodyRef={heatmapBodyRef}
          >
            <ContributionHeatmap
              cells={contributionQuery.data ?? []}
              settings={cycleSettings}
              onSettingsChange={onCycleSettingsChange}
              variant={layoutTheme === "dock" ? "micro" : "compact"}
              onContentHeightChange={(heightPx) =>
                setHeatmapContentHeight((previous) => (previous === heightPx ? previous : heightPx))
              }
            />
          </Panel>
        );
      case "health":
        return (
          <Panel
            title={t("panel.health.title")}
            subtitle={t("panel.health.subtitle")}
            bodyClassName="health-panel-body"
            panelRef={healthPanelRef}
            bodyRef={healthBodyRef}
          >
            <SourceHealthPanel
              items={sourceStatus}
              variant="summary"
              onContentHeightChange={(heightPx) =>
                setHealthContentHeight((previous) => (previous === heightPx ? previous : heightPx))
              }
            />
          </Panel>
        );
      case "models":
        return (
          <Panel title={t("panel.models.title")} subtitle={t("panel.models.subtitle")}>
            <BreakdownTable rows={modelRows.slice(0, 10)} variant="auto" mode="ranking" />
          </Panel>
        );
      case "rankSources":
        return (
          <Panel title={t("panel.rankSources.title")} subtitle={t("panel.rankSources.subtitle")}>
            <BreakdownTable rows={sourceRows.slice(0, 10)} variant="auto" />
          </Panel>
        );
      case "sources":
        return (
          <Panel title={t("panel.sources.title")} subtitle={t("panel.sources.subtitle")}>
            <ReactECharts echarts={echarts} option={sourcePie} style={{ height: 300 }} />
          </Panel>
        );
    }
  };

  return (
    <div className={`dashboard-shell layout-${layoutTheme}`}>
      <FilterDrawer
        open={drawerOpen}
        filter={filter}
        options={optionsQuery.data}
        onClose={() => setDrawerOpen(false)}
        onChange={onFilterChange}
      />

      <div
        ref={filterShellRef}
        className={filterPinnedActive ? "dashboard-filter-shell pinned" : "dashboard-filter-shell"}
        style={filterPinnedActive ? { minHeight: `${filterBounds.height}px` } : undefined}
      >
        <div
          className="dashboard-filter-frame"
          style={
            filterPinnedActive
              ? {
                  left: `${filterBounds.left}px`,
                  width: `${filterBounds.width}px`,
                }
              : undefined
          }
        >
          <FilterBar
            filter={filter}
            tokenModelOptions={tokenModelOptions}
            pinned={filterPinned}
            showInlineTools={inlineDockTools}
            activeFilterCount={activeFilterCount}
            onTogglePinned={onToggleFilterPinned}
            onScrollTop={onScrollTop}
            onChange={onFilterChange}
            onClear={onFilterClear}
            onOpenAdvanced={() => setDrawerOpen(true)}
            onRefresh={() => void refreshData()}
            onResetLayout={onLayoutReset}
            layoutCustomized={layoutCustomized}
          />
        </div>
      </div>

      <div ref={dashboardWrapRef} className="dashboard-grid-wrap">
        {canEditLayout ? (
          <GridLayout
            className="dashboard-grid"
            layout={displayLayout}
            width={dashboardWidth}
            gridConfig={{
              cols: DASHBOARD_GRID_COLUMNS,
              rowHeight: DASHBOARD_GRID_ROW_HEIGHT,
              margin: DASHBOARD_GRID_MARGIN,
              containerPadding: DASHBOARD_GRID_CONTAINER_PADDING,
              maxRows: Number.POSITIVE_INFINITY,
            }}
            dragConfig={{ handle: ".dashboard-drag-handle" }}
            resizeConfig={{ handles: ["se"] }}
            onResizeStart={() => setGridResizing(true)}
            onResizeStop={() => setGridResizing(false)}
            onLayoutChange={onLayoutChange}
          >
            {DASHBOARD_CARD_ORDER.map((cardId) => (
              <div
                key={cardId}
                className={`dashboard-item ${isFixedDashboardCard(cardId) ? "fixed" : "stretch"}`}
              >
                <span className="dashboard-drag-handle" title={t("dashboard.dragHandle")} aria-hidden="true">
                  ⠿
                </span>
                <div className="dashboard-item-body">{renderCard(cardId)}</div>
              </div>
            ))}
          </GridLayout>
        ) : (
          <div className="dashboard-stack">
            {DASHBOARD_CARD_ORDER.map((cardId) => (
              <section
                key={cardId}
                className={`dashboard-stack-item ${isFixedDashboardCard(cardId) ? "fixed" : "stretch"}`}
              >
                <div className="dashboard-item-body">{renderCard(cardId)}</div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function buildTokenModelOptions(rows: BreakdownRow[], selectedModels: string[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const model = (row.model ?? row.label).trim();
    if (!model) continue;
    totals.set(model, (totals.get(model) ?? 0) + row.total_tokens);
  }

  for (const selectedModel of selectedModels) {
    if (!totals.has(selectedModel)) {
      totals.set(selectedModel, 0);
    }
  }

  return [...totals.entries()]
    .map(([value, tokens]) => ({
      value,
      label: value,
      tokens,
    }))
    .sort((left, right) => {
      if (right.tokens !== left.tokens) return right.tokens - left.tokens;
      return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
    });
}

function countActiveFilters(filter: UsageFilter) {
  let count = 0;
  count += filter.sources.length;
  count += filter.providers.length;
  count += filter.models.length;
  count += filter.modelFamilies.length;
  count += filter.projects.length;
  count += filter.search ? 1 : 0;
  count += filter.since ? 1 : 0;
  count += filter.until ? 1 : 0;
  count += filter.mode ? 1 : 0;
  count += typeof filter.minTokens === "number" ? 1 : 0;
  count += typeof filter.maxTokens === "number" ? 1 : 0;
  count += typeof filter.minCost === "number" ? 1 : 0;
  count += typeof filter.maxCost === "number" ? 1 : 0;
  count += filter.excludeArchived ? 1 : 0;
  count += filter.preset && filter.preset !== defaultFilter.preset ? 1 : 0;
  return count;
}

function formatBucketLabel(value: string, bucket: TimelineBucket, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  if (bucket === "daily") {
    return date.toLocaleDateString(locale, {
      month: "2-digit",
      day: "2-digit",
    });
  }
  if (bucket === "hourly") {
    return date.toLocaleString(locale, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function timelineLabel(
  bucket: TimelineBucket,
  t: (key: "trend.bucket.daily" | "trend.bucket.hourly" | "trend.bucket.minutely") => string,
) {
  if (bucket === "hourly") return t("trend.bucket.hourly");
  if (bucket === "minutely") return t("trend.bucket.minutely");
  return t("trend.bucket.daily");
}

function timelineMetricLabel(
  metric: TrendMetric,
  t: (key: "trend.metric.tokens" | "trend.metric.cost" | "trend.metric.dual") => string,
) {
  if (metric === "cost") return t("trend.metric.cost");
  if (metric === "dual") return t("trend.metric.dual");
  return t("trend.metric.tokens");
}

function computeTimelineAxisStep(
  length: number,
  width: number,
  bucket: TimelineBucket,
) {
  if (length <= 2) return 1;
  const labelWidth = bucket === "daily" ? 72 : bucket === "hourly" ? 110 : 62;
  const maxLabels = Math.max(2, Math.floor(width / labelWidth));
  return Math.max(1, Math.ceil(length / maxLabels));
}

function isSameLayout(left: LayoutItem[], right: LayoutItem[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const current = left[index];
    const next = right[index];
    if (
      current.i !== next.i ||
      current.x !== next.x ||
      current.y !== next.y ||
      current.w !== next.w ||
      current.h !== next.h
    ) {
      return false;
    }
  }

  return true;
}
