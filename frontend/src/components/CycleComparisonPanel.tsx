import { useMemo, useState } from "react";
import type { ContributionCell } from "../lib/api";
import { ReactECharts, echarts } from "../lib/echarts";
import { formatCompactNumber, formatCompactUsd, formatUsd } from "../lib/format";
import { useLocale } from "../lib/i18n";
import {
  buildHeatmapCycleComparison,
  normalizeHeatmapCycleSettings,
  type HeatmapCycleComparisonBundle,
  type HeatmapCycleComparisonCycle,
  type HeatmapCycleComparisonPoint,
  type HeatmapCycleSettings,
} from "../lib/heatmapCycles";
import { chartPalette, useTheme } from "../lib/theme";

type CycleComparisonMetric = "tokens" | "cost";
type CycleComparisonMode = "totals" | "rhythm";
type CycleComparisonRhythmMode = "distribution" | "cumulative";

const CYCLE_SERIES_FALLBACK_COLORS = ["#f59e0b", "#8b5cf6", "#ec4899"] as const;

type CycleComparisonMetricDay = {
  index: number;
  label: string;
  day: string;
  value: number | null;
  secondaryValue: number | null;
  available: boolean;
};

type CycleComparisonMetricDayStats = {
  index: number;
  label: string;
  sampleCount: number;
  meanValue?: number;
  medianValue?: number;
  stdDevValue?: number;
  minValue?: number;
  maxValue?: number;
};

type CycleComparisonMetricCycle = {
  id: string;
  index: number;
  startDay: string;
  endDay: string;
  totalDays: number;
  elapsedDays: number;
  observedDays: number;
  observedActiveDays: number;
  observedTotalValue: number;
  secondaryObservedTotalValue: number;
  observedPerDay?: number;
  observedProjectedValue?: number;
  observedProjectedSecondaryValue?: number;
  peakDay?: string;
  peakValue: number;
  observedPeakDay?: string;
  observedPeakValue: number;
  curvePoints: HeatmapCycleComparisonPoint[];
  distributionDays: CycleComparisonMetricDay[];
  dayDeltaMeanValue?: number;
  frontHalfValue?: number;
  backHalfValue?: number;
  frontHalfShare?: number;
  backHalfShare?: number;
};

type CycleComparisonMetricView = {
  current: CycleComparisonMetricCycle;
  previous?: CycleComparisonMetricCycle;
  cycles: CycleComparisonMetricCycle[];
  historyCycleCount: number;
  baselineTotalMean?: number;
  baselineTotalMedian?: number;
  alignedDayMean?: number;
  alignedDayMedian?: number;
  alignedVolatilityMean?: number;
  alignedVolatilityMedian?: number;
  currentVsPreviousPct?: number;
  currentVsBaselineMeanPct?: number;
  dayStats: CycleComparisonMetricDayStats[];
};

type CycleComparisonPanelProps = {
  cells: ContributionCell[];
  settings: HeatmapCycleSettings;
};

export default function CycleComparisonPanel({
  cells,
  settings,
}: CycleComparisonPanelProps) {
  const { locale, t } = useLocale();
  const { theme } = useTheme();
  const palette = chartPalette(theme);
  const [metric, setMetric] = useState<CycleComparisonMetric>("tokens");
  const [mode, setMode] = useState<CycleComparisonMode>("totals");
  const [rhythmMode, setRhythmMode] = useState<CycleComparisonRhythmMode>("distribution");
  const comparison = useMemo(
    () => buildHeatmapCycleComparison(cells, normalizeHeatmapCycleSettings(settings)),
    [cells, settings],
  );
  const metricView = useMemo(
    () => buildCycleComparisonMetricView(comparison, metric),
    [comparison, metric],
  );
  const current = metricView.current;
  const previous = metricView.previous;
  const chartOption = useMemo(() => {
    if (mode === "totals") {
      return buildTotalsChartOption([...metricView.cycles].reverse(), locale, t, palette, metric);
    }
    return rhythmMode === "distribution"
      ? buildDistributionChartOption(metricView, locale, t, palette, metric)
      : buildCumulativeChartOption([...metricView.cycles].reverse(), locale, t, palette, metric);
  }, [locale, metric, metricView, mode, palette, rhythmMode, t]);
  const chartHeight =
    mode === "totals"
      ? 280
      : rhythmMode === "distribution"
        ? comparison.cycleDays > 14
          ? 380
          : 340
        : 320;
  const currentRange = formatCycleRange(current.startDay, current.endDay, locale);

  return (
    <div className="cycle-compare-panel">
      <div className="cycle-compare-head">
        <div className="cycle-compare-copy">
          <p className="cycle-compare-window">
            {t("cycleCompare.window", { range: currentRange })}
          </p>
          <p className="cycle-compare-baseline">
            {t("cycleCompare.baselineHint", { count: comparison.stats.historyCycleCount })}
          </p>
        </div>

        <div className="cycle-compare-toolbar cycle-compare-mode-stack">


          {mode === "rhythm" ? (
            <div
              className="button-group timeline-switch cycle-compare-subswitch"
              role="group"
              aria-label={t("cycleCompare.aria.rhythmMode")}
            >
              <button
                type="button"
                className={
                  rhythmMode === "distribution" ? "timeline-button active" : "timeline-button"
                }
                aria-pressed={rhythmMode === "distribution"}
                onClick={() => setRhythmMode("distribution")}
              >
                {t("cycleCompare.mode.distribution")}
              </button>
              <button
                type="button"
                className={rhythmMode === "cumulative" ? "timeline-button active" : "timeline-button"}
                aria-pressed={rhythmMode === "cumulative"}
                onClick={() => setRhythmMode("cumulative")}
              >
                {t("cycleCompare.mode.cumulative")}
              </button>
            </div>
          ) : null}

          <div
            className="button-group timeline-switch"
            role="group"
            aria-label={t("cycleCompare.aria.mode")}
          >
            <button
              type="button"
              className={mode === "totals" ? "timeline-button active" : "timeline-button"}
              aria-pressed={mode === "totals"}
              onClick={() => setMode("totals")}
            >
              {t("cycleCompare.mode.total")}
            </button>
            <button
              type="button"
              className={mode === "rhythm" ? "timeline-button active" : "timeline-button"}
              aria-pressed={mode === "rhythm"}
              onClick={() => setMode("rhythm")}
            >
              {t("cycleCompare.mode.rhythm")}
            </button>
          </div>

          <div
            className="button-group timeline-switch cycle-compare-subswitch"
            role="group"
            aria-label={t("cycleCompare.aria.metric")}
          >
            <button
              type="button"
              className={metric === "tokens" ? "timeline-button active" : "timeline-button"}
              aria-pressed={metric === "tokens"}
              onClick={() => setMetric("tokens")}
            >
              {t("cycleCompare.metric.tokens")}
            </button>
            <button
              type="button"
              className={metric === "cost" ? "timeline-button active" : "timeline-button"}
              aria-pressed={metric === "cost"}
              onClick={() => setMetric("cost")}
            >
              {t("cycleCompare.metric.cost")}
            </button>
          </div>

        </div>
      </div>

      <div className="cycle-compare-summary-grid">
        <article className="cycle-compare-card current">
          <span>{t("heatmap.cycle.current")}</span>
          <strong>{formatMetricValue(current.observedTotalValue, metric, locale)}</strong>
          <em>
            {formatMetricValue(current.secondaryObservedTotalValue, oppositeMetric(metric), locale)}
          </em>
          <p>
            {t("heatmap.cycle.activeDays")}: {current.observedActiveDays}
            {" · "}
            {t("cycleCompare.observedDays", {
              value: current.observedDays,
              total: current.totalDays,
            })}
            {" · "}
            {t("cycleCompare.peakDay")}:{" "}
            {formatPeakSummary(current.peakDay, current.peakValue, metric, locale, t)}
          </p>
          <p>
            {t("cycleCompare.vsPrevious")}:{" "}
            {formatSignedPercent(metricView.currentVsPreviousPct)}
            {" · "}
            {t("cycleCompare.vsMean")}:{" "}
            {formatSignedPercent(metricView.currentVsBaselineMeanPct)}
          </p>
          <p>
            {t("cycleCompare.volatility")}:{" "}
            {formatMetricValueMaybe(current.dayDeltaMeanValue, metric, locale, t)}
            {" · "}
            {t("cycleCompare.split")}: {formatSplitSummary(current.frontHalfShare, current.backHalfShare, t)}
          </p>
        </article>

        <article className="cycle-compare-card previous">
          <span>{t("heatmap.cycle.previous", { index: 1 })}</span>
          <strong>{formatMetricValueMaybe(previous?.observedTotalValue, metric, locale, t)}</strong>
          <em>
            {formatMetricValueMaybe(
              previous?.secondaryObservedTotalValue,
              oppositeMetric(metric),
              locale,
              t,
            )}
          </em>
          <p>
            {t("heatmap.cycle.activeDays")}: {formatMaybeCompactNumber(previous?.observedActiveDays, t)}
            {" · "}
            {t("cycleCompare.ratePerDay", {
              value: formatMetricValueMaybe(previous?.observedPerDay, metric, locale, t),
            })}
          </p>
          <p>
            {t("cycleCompare.volatility")}:{" "}
            {formatMetricValueMaybe(previous?.dayDeltaMeanValue, metric, locale, t)}
            {" · "}
            {t("cycleCompare.split")}:{" "}
            {formatSplitSummary(previous?.frontHalfShare, previous?.backHalfShare, t)}
          </p>
          <p>
            {formatCycleRange(previous?.startDay ?? current.startDay, previous?.endDay ?? current.endDay, locale)}
          </p>
        </article>

        <article className="cycle-compare-card baseline">
          <span>{t("cycleCompare.summary.baseline")}</span>
          <strong>{formatMetricValueMaybe(metricView.baselineTotalMean, metric, locale, t)}</strong>
          <em>
            {t("cycleCompare.medianValue", {
              value: formatMetricValueMaybe(metricView.baselineTotalMedian, metric, locale, t),
            })}
          </em>
          <p>
            {t("cycleCompare.summary.fromCycles", { count: metricView.historyCycleCount })}
          </p>
          <p>
            {t("cycleCompare.sameDayMean", {
              value: formatMetricValueMaybe(metricView.alignedDayMean, metric, locale, t),
            })}
            {" · "}
            {t("cycleCompare.sameDayMedian", {
              value: formatMetricValueMaybe(metricView.alignedDayMedian, metric, locale, t),
            })}
          </p>
          <p>
            {t("cycleCompare.alignedVolatilityMean", {
              value: formatMetricValueMaybe(metricView.alignedVolatilityMean, metric, locale, t),
            })}
            {" · "}
            {t("cycleCompare.alignedVolatilityMedian", {
              value: formatMetricValueMaybe(metricView.alignedVolatilityMedian, metric, locale, t),
            })}
          </p>
        </article>

        <article className="cycle-compare-card projection">
          <span>{t("cycleCompare.summary.projection")}</span>
          <strong>{formatMetricValueMaybe(current.observedProjectedValue, metric, locale, t)}</strong>
          <em>
            {t("cycleCompare.ratePerDay", {
              value: formatMetricValueMaybe(current.observedPerDay, metric, locale, t),
            })}
          </em>
          <p>
            {metric === "tokens"
              ? t("cycleCompare.projectedCost", {
                  value: formatMaybeUsd(current.observedProjectedSecondaryValue, locale, t),
                })
              : t("cycleCompare.projectedTokens", {
                  value: formatMaybeCompactNumber(current.observedProjectedSecondaryValue, t),
                })}
          </p>
          <p>
            {t("cycleCompare.elapsed", {
              value: current.observedDays,
              total: current.totalDays,
            })}
          </p>
        </article>
      </div>

      <div className="cycle-compare-chart">
        <ReactECharts echarts={echarts} option={chartOption} style={{ height: chartHeight }} notMerge />
      </div>

      <p className="cycle-compare-footnote">
        {mode === "totals"
          ? t("cycleCompare.note.total")
          : rhythmMode === "distribution"
            ? t("cycleCompare.note.distribution")
            : t("cycleCompare.note.cumulative")}
      </p>

      {cells.length === 0 ? <p className="cycle-compare-empty">{t("cycleCompare.empty")}</p> : null}
    </div>
  );
}

function buildCycleComparisonMetricView(
  comparison: HeatmapCycleComparisonBundle,
  metric: CycleComparisonMetric,
): CycleComparisonMetricView {
  const cycles = comparison.cycles.map((cycle) => buildCycleComparisonMetricCycle(cycle, metric));
  const previousCycles = cycles.slice(1);
  const baselineTotals = previousCycles.map((cycle) => cycle.observedTotalValue);
  const baselineTotalMean = mean(baselineTotals);
  const baselineTotalMedian = median(baselineTotals);
  const dayStats = buildCycleComparisonMetricDayStats(cycles);
  const alignedDayMean = mean(dayStats.map((day) => day.meanValue).filter(isNumber));
  const alignedDayMedian = median(dayStats.map((day) => day.medianValue).filter(isNumber));
  const alignedVolatilityMean = mean(dayStats.map((day) => day.stdDevValue).filter(isNumber));
  const alignedVolatilityMedian = median(dayStats.map((day) => day.stdDevValue).filter(isNumber));
  const current = cycles[0]!;
  const previous = cycles[1];

  return {
    cycles,
    current,
    previous,
    historyCycleCount: previousCycles.length,
    baselineTotalMean,
    baselineTotalMedian,
    alignedDayMean,
    alignedDayMedian,
    alignedVolatilityMean,
    alignedVolatilityMedian,
    currentVsPreviousPct: percentChange(current?.observedTotalValue, previous?.observedTotalValue),
    currentVsBaselineMeanPct: percentChange(current?.observedTotalValue, baselineTotalMean),
    dayStats,
  };
}

function buildCycleComparisonMetricCycle(
  cycle: HeatmapCycleComparisonCycle,
  metric: CycleComparisonMetric,
): CycleComparisonMetricCycle {
  const secondaryMetric = oppositeMetric(metric);
  const distributionDays = cycle.distributionDays.map((day) => ({
    index: day.index,
    label: day.label,
    day: day.day,
    available: day.available,
    value: day.available ? getMetricDayValue(day, metric) : null,
    secondaryValue: day.available ? getMetricDayValue(day, secondaryMetric) : null,
  }));
  const availableDays = distributionDays.filter((day) => day.available);
  const observedDays = availableDays.length;
  const observedTotalValue = sum(availableDays.map((day) => day.value ?? 0));
  const secondaryObservedTotalValue = sum(availableDays.map((day) => day.secondaryValue ?? 0));
  const observedPerDay = observedDays > 0 ? observedTotalValue / observedDays : undefined;
  const observedProjectedValue =
    typeof observedPerDay === "number" ? observedPerDay * cycle.days.length : undefined;
  const observedProjectedSecondaryValue =
    observedDays > 0 ? (secondaryObservedTotalValue / observedDays) * cycle.days.length : undefined;
  const peak = findMetricPeakDay(availableDays);
  const splitIndex = Math.ceil(cycle.days.length / 2);
  const frontHalfValue = sum(
    availableDays
      .filter((day) => day.index < splitIndex)
      .map((day) => day.value ?? 0),
  );
  const backHalfValue = sum(
    availableDays
      .filter((day) => day.index >= splitIndex)
      .map((day) => day.value ?? 0),
  );
  const frontBackTotal = frontHalfValue + backHalfValue;

  return {
    id: cycle.id,
    index: cycle.index,
    startDay: cycle.startDay,
    endDay: cycle.endDay,
    totalDays: cycle.days.length,
    elapsedDays: cycle.elapsedDays,
    observedDays: cycle.availableDays,
    observedActiveDays: cycle.observedActiveDays,
    observedTotalValue,
    secondaryObservedTotalValue,
    observedPerDay,
    observedProjectedValue,
    observedProjectedSecondaryValue,
    peakDay: peak?.day,
    peakValue: peak?.value ?? 0,
    observedPeakDay: peak?.day,
    observedPeakValue: peak?.value ?? 0,
    curvePoints: buildMetricCurvePoints(
      { index: cycle.index, observedDays },
      distributionDays,
      observedProjectedValue,
      observedTotalValue,
    ),
    distributionDays,
    dayDeltaMeanValue: averageAbsoluteDelta(availableDays.map((day) => day.value ?? 0)),
    frontHalfValue,
    backHalfValue,
    frontHalfShare: frontBackTotal > 0 ? (frontHalfValue / frontBackTotal) * 100 : undefined,
    backHalfShare: frontBackTotal > 0 ? (backHalfValue / frontBackTotal) * 100 : undefined,
  };
}

function buildCycleComparisonMetricDayStats(cycles: CycleComparisonMetricCycle[]) {
  const dayCount = cycles[0]?.distributionDays.length ?? 0;
  const stats: CycleComparisonMetricDayStats[] = [];

  for (let index = 0; index < dayCount; index += 1) {
    const points = cycles
      .map((cycle) => cycle.distributionDays[index])
      .filter((day): day is CycleComparisonMetricDay => Boolean(day) && day.available && isNumber(day.value));
    const values = points.map((day) => day.value as number);
    stats.push({
      index,
      label: points[0]?.label ?? `D${index + 1}`,
      sampleCount: values.length,
      meanValue: mean(values),
      medianValue: median(values),
      stdDevValue: standardDeviation(values),
      minValue: values.length > 0 ? Math.min(...values) : undefined,
      maxValue: values.length > 0 ? Math.max(...values) : undefined,
    });
  }

  return stats;
}

function buildMetricCurvePoints(
  cycle: { index: number; observedDays: number },
  distributionDays: CycleComparisonMetricDay[],
  observedProjectedValue?: number,
  observedTotalValue?: number,
) {
  const denominator =
    cycle.index === 0
      ? observedProjectedValue ?? observedTotalValue ?? 0
      : observedTotalValue ?? 0;
  const safeDenominator = denominator > 0 ? denominator : 0;
  const currentObserved = observedTotalValue ?? 0;
  const runRate = cycle.observedDays > 0 ? currentObserved / cycle.observedDays : undefined;
  const points: HeatmapCycleComparisonPoint[] = [];
  let cumulativeValue = 0;

  for (let index = 0; index < distributionDays.length; index += 1) {
    const progress = distributionDays.length <= 1 ? 100 : (index / (distributionDays.length - 1)) * 100;
    const day = distributionDays[index];

    if (cycle.index === 0 && typeof runRate === "number") {
      if (index < cycle.observedDays) {
        cumulativeValue += day?.available ? day.value ?? 0 : 0;
      } else {
        cumulativeValue = currentObserved + runRate * (index + 1 - cycle.observedDays);
      }
    } else {
      cumulativeValue += day?.available ? day.value ?? 0 : 0;
    }

    const share = safeDenominator > 0 ? (cumulativeValue / safeDenominator) * 100 : 0;
    points.push([progress, share]);
  }

  return points;
}

function getMetricDayValue(day: { totalTokens: number | null; totalCostUsd: number | null }, metric: CycleComparisonMetric) {
  return metric === "tokens" ? (day.totalTokens ?? 0) : (day.totalCostUsd ?? 0);
}

function buildTotalsChartOption(
  cycles: CycleComparisonMetricCycle[],
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
  palette: ReturnType<typeof chartPalette>,
  metric: CycleComparisonMetric,
) {
  const cycleLabels = cycles.map((cycle) => cycleLabel(cycle, t));

  return {
    grid: { left: 72, right: 28, top: 20, bottom: 30, containLabel: true },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => formatTotalsTooltip(params, cycles, locale, t, metric),
    },
    xAxis: {
      type: "category",
      data: cycleLabels,
      axisLabel: { color: palette.axis },
      axisLine: { lineStyle: { color: palette.splitLine } },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: palette.axis,
        formatter: (value: number) => formatMetricAxisValue(value, metric),
      },
      splitLine: { lineStyle: { color: palette.splitLine } },
    },
    series: [
      {
        name: metricLabel(metric, t),
        type: "bar",
        barWidth: 28,
        data: cycles.map((cycle) => ({
          value: cycle.observedTotalValue,
          itemStyle: {
            color: cycleColor(cycle, palette),
            borderRadius: [8, 8, 0, 0],
          },
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0, 0, 0, 0.18)",
          },
        },
      },
    ],
  };
}

function buildDistributionChartOption(
  comparison: CycleComparisonMetricView,
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
  palette: ReturnType<typeof chartPalette>,
  metric: CycleComparisonMetric,
) {
  const { cycles, dayStats } = comparison;
  const dayLabels = dayStats.map((day) => day.label);
  const seriesNames = cycles.map((cycle) => cycleLabel(cycle, t));
  const hasZoom = dayLabels.length > 14;

  return {
    legend: {
      top: 0,
      data: seriesNames,
      textStyle: { color: palette.axis },
      itemWidth: 12,
      itemHeight: 8,
    },
    grid: {
      left: 72,
      right: 28,
      top: 52,
      bottom: hasZoom ? 62 : 32,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => formatDistributionTooltip(params, cycles, dayStats, locale, t, metric),
    },
    xAxis: {
      type: "category",
      data: dayLabels,
      axisLabel: {
        color: palette.axis,
        hideOverlap: true,
      },
      axisLine: { lineStyle: { color: palette.splitLine } },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: palette.axis,
        formatter: (value: number) => formatMetricAxisValue(value, metric),
      },
      splitLine: { lineStyle: { color: palette.splitLine } },
    },
    dataZoom: hasZoom
      ? [
          {
            type: "inside",
            xAxisIndex: 0,
            filterMode: "none",
          },
          {
            type: "slider",
            xAxisIndex: 0,
            bottom: 6,
            height: 18,
            filterMode: "none",
            borderColor: palette.splitLine,
            backgroundColor: withAlpha(palette.splitLine, 0.08),
            fillerColor: withAlpha(palette.tokenLine, 0.16),
            handleStyle: {
              color: palette.tokenLine,
            },
            moveHandleStyle: {
              color: palette.tokenLine,
            },
          },
        ]
      : undefined,
    series: cycles.map((cycle) => ({
      name: cycleLabel(cycle, t),
      type: "bar",
      barWidth: 14,
      barGap: "14%",
      barCategoryGap: "32%",
      data: cycle.distributionDays.map((day) => day.available ? day.value : null),
      itemStyle: {
        color: cycleColor(cycle, palette),
        borderRadius: [6, 6, 0, 0],
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: "rgba(0, 0, 0, 0.18)",
        },
      },
    })),
  };
}

function buildCumulativeChartOption(
  cycles: CycleComparisonMetricCycle[],
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
  palette: ReturnType<typeof chartPalette>,
  metric: CycleComparisonMetric,
) {
  const cycleMap = new Map(cycles.map((cycle) => [cumulativeSeriesLabel(cycle, t), cycle]));
  const legendData = cycles.map((cycle) => cumulativeSeriesLabel(cycle, t));

  return {
    legend: {
      top: 0,
      data: legendData,
      textStyle: { color: palette.axis },
      itemWidth: 12,
      itemHeight: 8,
    },
    grid: { left: 72, right: 28, top: 48, bottom: 30, containLabel: true },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => formatCumulativeTooltip(params, cycleMap, locale, t, metric),
    },
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: {
        color: palette.axis,
        formatter: (value: number) => `${Math.round(value)}%`,
      },
      axisLine: { lineStyle: { color: palette.splitLine } },
      splitLine: { lineStyle: { color: palette.splitLine } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: {
        color: palette.axis,
        formatter: (value: number) => `${Math.round(value)}%`,
      },
      axisLine: { lineStyle: { color: palette.splitLine } },
      splitLine: { lineStyle: { color: palette.splitLine } },
    },
    series: cycles.map((cycle) => ({
      name: cumulativeSeriesLabel(cycle, t),
      type: "line",
      smooth: false,
      showSymbol: false,
      step: "end",
      lineStyle: {
        color: cycleColor(cycle, palette),
        width: cycle.index === 0 ? 3 : 2,
        type:
          cycle.index === 0 && cycle.elapsedDays < cycle.totalDays ? "dashed" : "solid",
      },
      itemStyle: { color: cycleColor(cycle, palette) },
      data: cycle.curvePoints,
    })),
  };
}

function formatTotalsTooltip(
  params: unknown,
  cycles: CycleComparisonMetricCycle[],
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
  metric: CycleComparisonMetric,
) {
  const rows = Array.isArray(params) ? params : [params];
  const first = rows[0] as { dataIndex?: number; axisValueLabel?: string };
  const cycle = typeof first?.dataIndex === "number" ? cycles[first.dataIndex] : undefined;
  if (!cycle) {
    return "";
  }

  const title = first.axisValueLabel ?? cycleLabel(cycle, t);
  return [
    title,
    `${metricLabel(metric, t)}: ${formatMetricValue(cycle.observedTotalValue, metric, locale)}`,
    `${metricLabel(oppositeMetric(metric), t)}: ${formatMetricValue(
      cycle.secondaryObservedTotalValue,
      oppositeMetric(metric),
      locale,
    )}`,
    `${t("heatmap.cycle.activeDays")}: ${cycle.observedActiveDays}`,
    `${t("cycleCompare.rate")}: ${formatMetricValueMaybe(cycle.observedPerDay, metric, locale, t)}/${t("cycleCompare.day")}`,
    `${t("cycleCompare.peakDay")}: ${formatPeakSummary(cycle.peakDay, cycle.peakValue, metric, locale, t)}`,
  ].join("<br/>");
}

function formatDistributionTooltip(
  params: unknown,
  cycles: CycleComparisonMetricCycle[],
  dayStats: CycleComparisonMetricDayStats[],
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
  metric: CycleComparisonMetric,
) {
  const rows = Array.isArray(params) ? params : [params];
  const first = rows[0] as { dataIndex?: number };
  const dayIndex = first?.dataIndex ?? 0;
  const dayStat = dayStats[dayIndex];
  if (!dayStat) {
    return "";
  }

  const currentDay = cycles[0]?.distributionDays[dayIndex];
  const title = currentDay ? `${dayStat.label} · ${formatDayShort(currentDay.day, locale)}` : dayStat.label;
  const cycleLines = cycles.map((cycle) => {
    const point = cycle.distributionDays[dayIndex];
    const label = cycleLabel(cycle, t);
    if (!point || !point.available || point.value === null) {
      return `${label}: ${t("cycleCompare.futureDay")}`;
    }

    return [
      `${label} (${formatDayShort(point.day, locale)}): ${metricLabel(metric, t)}: ${formatMetricValue(
        point.value,
        metric,
        locale,
      )}`,
      `${metricLabel(oppositeMetric(metric), t)}: ${formatMetricValue(
        point.secondaryValue ?? 0,
        oppositeMetric(metric),
        locale,
      )}`,
    ].join("<br/>");
  });

  return [
    title,
    `${t("cycleCompare.sameDayMean", {
      value: formatMetricValueMaybe(dayStat.meanValue, metric, locale, t),
    })}`,
    `${t("cycleCompare.sameDayMedian", {
      value: formatMetricValueMaybe(dayStat.medianValue, metric, locale, t),
    })}`,
    `${t("cycleCompare.volatility")}: ${formatMetricValueMaybe(dayStat.stdDevValue, metric, locale, t)}`,
    ...cycleLines,
  ].join("<br/>");
}

function formatCumulativeTooltip(
  params: unknown,
  cycleMap: Map<string, CycleComparisonMetricCycle>,
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
  metric: CycleComparisonMetric,
) {
  const rows = Array.isArray(params) ? params : [params];
  const first = rows[0] as {
    seriesName?: string;
    data?: [number, number];
  };
  const cycle = first.seriesName ? cycleMap.get(first.seriesName) : undefined;
  if (!cycle || !first.data) {
    return "";
  }

  const [progress, share] = first.data;
  const projectedTotal = cycle.observedProjectedValue ?? cycle.observedTotalValue;
  const projectedSecondary = cycle.observedProjectedSecondaryValue ?? cycle.secondaryObservedTotalValue;
  return [
    first.seriesName,
    `${t("cycleCompare.progress")}: ${Math.round(progress)}%`,
    `${t("cycleCompare.share")}: ${share.toFixed(1)}%`,
    `${metricLabel(metric, t)}: ${formatMetricValue(projectedTotal, metric, locale)}`,
    `${metricLabel(oppositeMetric(metric), t)}: ${formatMetricValue(
      projectedSecondary,
      oppositeMetric(metric),
      locale,
    )}`,
    `${t("heatmap.cycle.activeDays")}: ${cycle.observedActiveDays}`,
  ].join("<br/>");
}

function cycleLabel(cycle: { index: number }, t: ReturnType<typeof useLocale>["t"]) {
  if (cycle.index === 0) return t("heatmap.cycle.current");
  return t("heatmap.cycle.previous", { index: cycle.index });
}

function cumulativeSeriesLabel(
  cycle: { index: number; elapsedDays: number; totalDays: number },
  t: ReturnType<typeof useLocale>["t"],
) {
  if (cycle.index === 0 && cycle.elapsedDays < cycle.totalDays) {
    return t("cycleCompare.currentPace");
  }
  return cycleLabel(cycle, t);
}

function cycleColor(
  cycle: { index: number },
  palette: ReturnType<typeof chartPalette>,
) {
  if (cycle.index === 0) {
    return palette.tokenLine;
  }

  return CYCLE_SERIES_FALLBACK_COLORS[cycle.index - 1] ?? palette.tokenLine;
}

function metricLabel(metric: CycleComparisonMetric, t: ReturnType<typeof useLocale>["t"]) {
  return metric === "tokens" ? t("cycleCompare.metric.tokens") : t("cycleCompare.metric.cost");
}

function oppositeMetric(metric: CycleComparisonMetric): CycleComparisonMetric {
  return metric === "tokens" ? "cost" : "tokens";
}

function formatMetricValue(
  value: number,
  metric: CycleComparisonMetric,
  locale: ReturnType<typeof useLocale>["locale"],
) {
  if (metric === "cost") {
    return formatUsd(value, locale);
  }

  return formatCompactNumber(value);
}

function formatMetricAxisValue(
  value: number,
  metric: CycleComparisonMetric,
) {
  if (metric === "cost") {
    return formatCompactUsd(value);
  }

  return formatCompactNumber(value);
}

function formatMetricValueMaybe(
  value: number | undefined,
  metric: CycleComparisonMetric,
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return t("common.na");
  }

  return formatMetricValue(value, metric, locale);
}

function formatCycleRange(
  startDay: string,
  endDay: string,
  locale: ReturnType<typeof useLocale>["locale"],
) {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
  });
  return `${formatter.format(new Date(`${startDay}T00:00:00Z`))} - ${formatter.format(new Date(`${endDay}T00:00:00Z`))}`;
}

function formatDayShort(day: string, locale: ReturnType<typeof useLocale>["locale"]) {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${day}T00:00:00Z`));
}

function formatMaybeCompactNumber(value?: number, t?: ReturnType<typeof useLocale>["t"]) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return t ? t("common.na") : "n/a";
  }
  return formatCompactNumber(value);
}

function formatMaybeUsd(
  value?: number,
  locale?: ReturnType<typeof useLocale>["locale"],
  t?: ReturnType<typeof useLocale>["t"],
) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return t ? t("common.na") : "n/a";
  }
  return formatUsd(value, locale ?? "en");
}

function formatSignedPercent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function formatMaybePercent(value?: number, t?: ReturnType<typeof useLocale>["t"]) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return t ? t("common.na") : "n/a";
  }
  return `${value.toFixed(1)}%`;
}

function formatSplitSummary(
  frontHalfShare?: number,
  backHalfShare?: number,
  t?: ReturnType<typeof useLocale>["t"],
) {
  const front = formatMaybePercent(frontHalfShare, t);
  const back = formatMaybePercent(backHalfShare, t);
  return `${front} / ${back}`;
}

function formatPeakSummary(
  day: string | undefined,
  tokens: number,
  metric: CycleComparisonMetric,
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
) {
  if (!day) {
    return t("common.na");
  }

  return `${formatPeakDay(day, locale, t)} / ${formatMetricValue(tokens, metric, locale)}`;
}

function formatPeakDay(
  day: string | undefined,
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
) {
  if (!day) {
    return t("common.na");
  }

  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
    month: "2-digit",
    day: "2-digit",
  });
}

function withAlpha(color: string, alpha: number) {
  const normalized = color.trim();
  if (!normalized.startsWith("#")) {
    return color;
  }

  const hex = normalized.slice(1);
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : hex;
  const value = Number.parseInt(expanded, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  return sum(values) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return undefined;
  }

  const average = mean(values);
  if (typeof average !== "number") {
    return undefined;
  }

  const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function averageAbsoluteDelta(values: number[]) {
  if (values.length < 2) {
    return undefined;
  }

  let total = 0;
  for (let index = 1; index < values.length; index += 1) {
    total += Math.abs(values[index] - values[index - 1]);
  }

  return total / (values.length - 1);
}

function percentChange(current?: number, previous?: number) {
  if (typeof current !== "number" || typeof previous !== "number" || Number.isNaN(current) || Number.isNaN(previous) || previous === 0) {
    return undefined;
  }

  return ((current - previous) / previous) * 100;
}

function findMetricPeakDay(days: CycleComparisonMetricDay[]) {
  let peak: CycleComparisonMetricDay | null = null;

  for (const day of days) {
    if (!day.available || !isNumber(day.value)) {
      continue;
    }
    if (!peak || day.value > (peak.value ?? 0)) {
      peak = day;
    }
  }

  if (!peak || !isNumber(peak.value) || peak.value <= 0) {
    return null;
  }

  return {
    day: peak.day,
    value: peak.value,
  };
}
