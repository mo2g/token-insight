import { formatCompactNumber, formatCompactUsd, formatUsd } from "./format";
import type { useLocale } from "./i18n";

export type CycleComparisonMetric = "tokens" | "cost";
export type CycleComparisonMode = "totals" | "rhythm";
export type CycleComparisonRhythmMode = "distribution" | "cumulative";

export const CYCLE_SERIES_FALLBACK_COLORS = ["#f59e0b", "#8b5cf6", "#ec4899"] as const;

export function oppositeMetric(metric: CycleComparisonMetric): CycleComparisonMetric {
  return metric === "tokens" ? "cost" : "tokens";
}

export function safePercentChange(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

export function metricLabel(
  metric: CycleComparisonMetric,
  t: ReturnType<typeof useLocale>["t"],
) {
  return metric === "tokens" ? t("cycleCompare.metric.tokens") : t("cycleCompare.metric.cost");
}

export function formatMetricValue(
  value: number,
  metric: CycleComparisonMetric,
  locale: ReturnType<typeof useLocale>["locale"],
) {
  if (metric === "cost") return formatCompactUsd(value);
  return formatCompactNumber(value);
}

export function formatMetricAxisValue(value: number, metric: CycleComparisonMetric) {
  if (metric === "cost") return formatCompactUsd(value);
  return formatCompactNumber(value);
}

export function formatMetricValueMaybe(
  value: number | undefined,
  metric: CycleComparisonMetric,
  locale: ReturnType<typeof useLocale>["locale"],
) {
  if (value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return formatMetricValue(value, metric, locale);
}

export function formatCycleRange(
  startDay: string,
  endDay: string,
  locale: ReturnType<typeof useLocale>["locale"],
) {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(new Date(`${startDay}T00:00:00Z`))} - ${formatter.format(new Date(`${endDay}T00:00:00Z`))}`;
}

export function formatDayShort(day: string, locale: ReturnType<typeof useLocale>["locale"]) {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${day}T00:00:00Z`));
}

export function formatMaybeCompactNumber(value?: number, t?: ReturnType<typeof useLocale>["t"]) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return t ? t("common.na") : "n/a";
  }
  return formatCompactNumber(value);
}

export function formatMaybeUsd(
  value?: number,
  locale?: ReturnType<typeof useLocale>["locale"],
  t?: ReturnType<typeof useLocale>["t"],
) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return t ? t("common.na") : "n/a";
  }
  return formatUsd(value, locale ?? "en");
}

export function formatSignedPercent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

export function formatMaybePercent(value?: number, t?: ReturnType<typeof useLocale>["t"]) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return t ? t("common.na") : "n/a";
  }
  return `${value.toFixed(1)}%`;
}

export function formatSplitSummary(
  frontHalfShare?: number,
  backHalfShare?: number,
  t?: ReturnType<typeof useLocale>["t"],
) {
  const front = formatMaybePercent(frontHalfShare ? frontHalfShare * 100 : undefined, t);
  const back = formatMaybePercent(backHalfShare ? backHalfShare * 100 : undefined, t);
  return `${front} / ${back}`;
}

export function formatPeakSummary(
  day: string | undefined,
  tokens: number,
  metric: CycleComparisonMetric,
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
) {
  return `${formatPeakDay(day, locale, t)} / ${formatMetricValue(tokens, metric, locale)}`;
}

export function formatPeakDay(
  day: string | undefined,
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
) {
  if (!day) return t("common.na");
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${day}T00:00:00Z`));
}

export function withAlpha(color: string, alpha: number) {
  const normalized = color.trim();
  if (!normalized.startsWith("#")) {
    return color;
  }
  const hex = normalized.slice(1);
  const bigint = parseInt(hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex, 16);
  const red = (bigint >> 16) & 255;
  const green = (bigint >> 8) & 255;
  const blue = bigint & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function mean(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  return sum(values) / values.length;
}

export function median(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

export function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return undefined;
  }
  const avg = mean(values);
  if (avg === undefined) return undefined;
  const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
  const avgSquareDiff = mean(squareDiffs);
  if (avgSquareDiff === undefined) return undefined;
  return Math.sqrt(avgSquareDiff);
}

export function averageAbsoluteDelta(values: number[]) {
  if (values.length < 2) {
    return undefined;
  }
  let total = 0;
  for (let i = 1; i < values.length; i++) {
    total += Math.abs(values[i] - values[i - 1]);
  }
  return total / (values.length - 1);
}
