import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import BreakdownTable from "../components/BreakdownTable";
import ContributionHeatmap from "../components/ContributionHeatmap";
import FilterBar from "../components/FilterBar";
import FilterDrawer from "../components/FilterDrawer";
import MetricCard from "../components/MetricCard";
import Panel from "../components/Panel";
import {
  type TimelineBucket,
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
import { ReactECharts, echarts } from "../lib/echarts";
import {
  formatCompactNumber,
  formatCompactUsd,
  formatDate,
  formatNumber,
  formatUsd,
} from "../lib/format";
import { defaultFilter, mergeFilter, parseFilter } from "../lib/filters";
import { useLocale } from "../lib/i18n";
import { useRefreshStream } from "../lib/useRefreshStream";

export default function DashboardPage() {
  const { locale, t } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [timelineBucket, setTimelineBucket] = useState<TimelineBucket>("daily");
  const [timelineMetric, setTimelineMetric] = useState<TrendMetric>("tokens");
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(860);
  const filter = useMemo(
    () => mergeFilter(defaultFilter, parseFilter(searchParams)),
    [searchParams],
  );

  useRefreshStream();

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

  const overviewQuery = useQuery({
    queryKey: ["overview", filter],
    queryFn: () => fetchOverview(filter),
  });
  const modelQuery = useQuery({
    queryKey: ["models", filter],
    queryFn: () => fetchModelsBreakdown(filter),
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
        color: "#738180",
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
                color: "#738180",
                margin: 12,
                formatter: (value: number) => formatCompactNumber(value),
              },
              splitLine: { lineStyle: { color: "rgba(115,129,128,0.15)" } },
            },
            {
              type: "value",
              name: t("trend.series.cost"),
              axisLabel: {
                color: "#c58d6d",
                margin: 12,
                formatter: (value: number) => formatCompactUsd(value),
              },
              splitLine: { show: false },
            },
          ]
        : {
            type: "value",
            axisLabel: {
              color: "#738180",
              margin: 12,
              formatter: (value: number) =>
                timelineMetric === "cost"
                  ? formatCompactUsd(value)
                  : formatCompactNumber(value),
            },
            splitLine: { lineStyle: { color: "rgba(115,129,128,0.15)" } },
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
              lineStyle: { color: "#1ba784", width: 3 },
              itemStyle: { color: "#1ba784" },
              areaStyle: {
                color: "rgba(27,167,132,0.12)",
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
              lineStyle: { color: "#ff8c42", width: 3 },
              itemStyle: { color: "#ff8c42" },
              areaStyle: timelineMetric === "cost" ? { color: "rgba(255,140,66,0.12)" } : undefined,
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
        label: { color: "#f4efe7" },
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

  const exportBase = `/api/export/events.json?${filterToQuery(filter).toString()}`;
  const exportCsv = `/api/export/events.csv?${filterToQuery(filter).toString()}`;

  return (
    <div className="dashboard-grid">
      <FilterBar
        filter={filter}
        onChange={onFilterChange}
        onClear={onFilterClear}
        onOpenAdvanced={() => setDrawerOpen(true)}
        onRefresh={() => void refreshData()}
      />

      <FilterDrawer
        open={drawerOpen}
        filter={filter}
        options={optionsQuery.data}
        onClose={() => setDrawerOpen(false)}
        onChange={onFilterChange}
      />

      <section className="metrics-grid">
        <MetricCard
          label={t("metric.totalTokens")}
          value={formatNumber(overview?.total_tokens ?? 0)}
          detail={t("metric.eventsDetail", { count: overview?.event_count ?? 0 })}
        />
        <MetricCard
          label={t("metric.estimatedCost")}
          value={formatUsd(overview?.total_cost_usd ?? 0, locale)}
          detail={t("metric.topModelDetail", {
            model: overview?.top_model ?? t("common.na"),
          })}
          tone="amber"
        />
        <MetricCard
          label={t("metric.activeDays")}
          value={String(overview?.active_days ?? 0)}
          detail={t("metric.streakDetail", { days: overview?.streak_days ?? 0 })}
        />
        <MetricCard
          label={t("metric.lastRefresh")}
          value={formatDate(overview?.last_refresh_at, locale, t("common.na"))}
          detail={t("metric.lastEventDetail", {
            value: formatDate(overview?.last_event_at, locale, t("common.na")),
          })}
        />
      </section>

      <Panel
        title={t("panel.trend.title")}
        subtitle={t("panel.trend.subtitle", {
          bucket: timelineLabel(timelineBucket, t),
          metric: timelineMetricLabel(timelineMetric, t),
        })}
        actions={
          <div className="panel-actions">
            <div className="button-group timeline-switch" role="group" aria-label={t("trend.aria.bucket")}>
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
            <div className="button-group timeline-switch" role="group" aria-label={t("trend.aria.metric")}>
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
            <a className="button ghost panel-ghost" href={exportBase}>
              {t("trend.exportJson")}
            </a>
            <a className="button ghost panel-ghost" href={exportCsv}>
              {t("trend.exportCsv")}
            </a>
          </div>
        }
      >
        <div ref={chartWrapRef}>
          <ReactECharts
            echarts={echarts}
            option={lineOption}
            style={{ height: 280 }}
            notMerge
          />
        </div>
      </Panel>

      <Panel title={t("panel.sources.title")} subtitle={t("panel.sources.subtitle")}>
        <ReactECharts echarts={echarts} option={sourcePie} style={{ height: 280 }} />
      </Panel>

      <Panel title={t("panel.heatmap.title")} subtitle={t("panel.heatmap.subtitle")}>
        <ContributionHeatmap cells={contributionQuery.data ?? []} />
      </Panel>

      <Panel title={t("panel.models.title")} subtitle={t("panel.models.subtitle")}>
        <BreakdownTable rows={modelRows.slice(0, 10)} />
      </Panel>

      <Panel title={t("panel.rankSources.title")} subtitle={t("panel.rankSources.subtitle")}>
        <BreakdownTable rows={sourceRows.slice(0, 10)} />
      </Panel>

      <Panel title={t("panel.health.title")} subtitle={t("panel.health.subtitle")}>
        <div className="status-list">
          {sourceStatus.map((item) => (
            <article key={item.source} className="status-card">
              <header>
                <strong>{item.label}</strong>
                <span>{item.mode}</span>
              </header>
              <p>{t("health.artifacts", { count: item.discovered_artifacts })}</p>
              <p>{t("health.events", { count: item.imported_events })}</p>
              <p>
                {t("health.lastScan", {
                  value: formatDate(item.last_scan_completed_at, locale, t("common.na")),
                })}
              </p>
              {item.last_error ? <p className="status-error">{item.last_error}</p> : null}
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
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

type TrendMetric = "tokens" | "cost" | "dual";

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
