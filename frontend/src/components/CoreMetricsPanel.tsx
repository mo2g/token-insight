import { useMemo, useState, type CSSProperties } from "react";
import type { OverviewStats } from "../lib/api";
import { formatNumber } from "../lib/format";
import { useLocale } from "../lib/i18n";

type CoreMetricsPanelProps = {
  stats?: OverviewStats;
};

type MetricSegment = {
  key: string;
  label: string;
  value: number;
  tone: "mint" | "amber" | "azure" | "violet" | "slate" | "rose";
};

type CostDisplayMode = "auto" | "usd" | "cents";

export default function CoreMetricsPanel({ stats }: CoreMetricsPanelProps) {
  const { locale, t } = useLocale();
  const [costMode, setCostMode] = useState<CostDisplayMode>("auto");
  const totalTokens = stats?.total_tokens ?? 0;
  const costDisplay = useMemo(
    () => formatCostDisplay(stats?.total_cost_usd ?? 0, locale, t, costMode),
    [costMode, locale, stats?.total_cost_usd, t],
  );
  const segments: MetricSegment[] = [
    {
      key: "prompt",
      label: t("metric.promptTokens"),
      value: stats?.prompt_tokens ?? 0,
      tone: "mint",
    },
    {
      key: "completion",
      label: t("metric.completionTokens"),
      value: stats?.completion_tokens ?? 0,
      tone: "amber",
    },
    {
      key: "cache-read",
      label: t("metric.cacheReadTokens"),
      value: stats?.cache_read_tokens ?? 0,
      tone: "azure",
    },
    {
      key: "cache-write",
      label: t("metric.cacheWriteTokens"),
      value: stats?.cache_write_tokens ?? 0,
      tone: "violet",
    },
    {
      key: "reasoning",
      label: t("metric.reasoningTokens"),
      value: stats?.reasoning_tokens ?? 0,
      tone: "slate",
    },
    {
      key: "tool",
      label: t("metric.toolTokens"),
      value: stats?.tool_tokens ?? 0,
      tone: "rose",
    },
  ];
  const segmentBase = segments.reduce((sum, segment) => sum + segment.value, 0) || totalTokens || 1;

  return (
    <section className="core-metrics">
      <div className="core-metrics-hero">
        <article className="core-metric-card lead">
          <span>{t("metric.totalTokens")}</span>
          <strong>{formatNumber(totalTokens)}</strong>
          <div className="core-metric-bottom">
            <p>{t("metric.eventsDetail", { count: stats?.event_count ?? 0 })}</p>
          </div>
        </article>
        <article className="core-metric-card amber cost-card">
          <span>{t("metric.estimatedCostUnit", { unit: costDisplay.unitLabel })}</span>
          <strong>{costDisplay.value}</strong>
          <div className="core-metric-bottom">
            <div className="core-metric-unit-switch" role="group" aria-label={t("metric.estimatedCost")}>
              {(["auto", "usd", "cents"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={costMode === mode ? "cost-unit-button active" : "cost-unit-button"}
                  aria-pressed={costMode === mode}
                  onClick={() => setCostMode(mode)}
                >
                  {costModeLabel(t, mode)}
                </button>
              ))}
            </div>
          </div>
        </article>
        <article className="core-metric-card">
          <span>{t("metric.totalEvents")}</span>
          <strong>{formatNumber(stats?.event_count ?? 0)}</strong>
          <div className="core-metric-bottom">
            <p>{t("metric.streakDetail", { days: stats?.streak_days ?? 0 })}</p>
          </div>
        </article>
        <article className="core-metric-card">
          <span>{t("metric.activeDays")}</span>
          <strong>{formatNumber(stats?.active_days ?? 0)}</strong>
          <div className="core-metric-bottom">
            <p>{t("metric.topModelDetail", { model: stats?.top_model ?? t("common.na") })}</p>
          </div>
        </article>
      </div>

      <section className="core-metrics-structure">
        <header>
          <strong>{t("metric.tokenMix")}</strong>
          <span>{t("metric.tokenMixDetail")}</span>
        </header>
        <div className="core-metrics-bar" role="img" aria-label={t("metric.tokenMix")}>
          {segments.map((segment) => {
            const style = {
              flexGrow: segment.value > 0 ? segment.value : 1,
            } satisfies CSSProperties;
            return (
              <span
                key={segment.key}
                className={`core-metrics-bar-segment ${segment.tone}`}
                style={style}
                title={`${segment.label}: ${formatNumber(segment.value)}`}
              />
            );
          })}
        </div>
        <div className="core-metrics-legend">
          {segments.map((segment) => (
            <article key={segment.key} className={`core-metrics-legend-item ${segment.tone}`}>
              <span>{segment.label}</span>
              <strong>{formatNumber(segment.value)}</strong>
              <em>{formatPercent(segment.value, segmentBase)}</em>
            </article>
          ))}
        </div>
      </section>

      <div className="core-metrics-context">
        <article>
          <span>{t("metric.topModel")}</span>
          <strong>{stats?.top_model ?? t("common.na")}</strong>
        </article>
        <article>
          <span>{t("metric.topSource")}</span>
          <strong>{stats?.top_source ?? t("common.na")}</strong>
        </article>
        <article>
          <span>{t("metric.currentStreak")}</span>
          <strong>{t("metric.streakDaysValue", { count: stats?.streak_days ?? 0 })}</strong>
        </article>
        <article>
          <span>{t("metric.lastRefresh")}</span>
          <strong>{formatDateValue(stats?.last_refresh_at, locale, t("common.na"))}</strong>
          <em>{t("metric.lastEventDetail", { value: formatDateValue(stats?.last_event_at, locale, t("common.na")) })}</em>
        </article>
      </div>
    </section>
  );
}

function formatDateValue(value: string | undefined, locale: string, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatPercent(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function costModeLabel(
  t: ReturnType<typeof useLocale>["t"],
  mode: CostDisplayMode,
) {
  switch (mode) {
    case "auto":
      return t("metric.costMode.auto");
    case "usd":
      return t("metric.costMode.usd");
    case "cents":
      return t("metric.costMode.cents");
  }
}

function formatCostDisplay(
  value: number,
  locale: string,
  t: ReturnType<typeof useLocale>["t"],
  mode: CostDisplayMode,
) {
  if (mode === "usd") {
    return {
      unitLabel: t("metric.costUnit.usd"),
      value: formatScaledNumber(value, locale, value >= 100 ? 0 : 2),
    };
  }

  if (mode === "cents") {
    const cents = value * 100;
    return {
      unitLabel: t("metric.costUnit.cents"),
      value: formatScaledNumber(cents, locale, Math.abs(cents) >= 100 ? 0 : 1),
    };
  }

  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return {
      unitLabel: t("metric.costUnit.billionUsd"),
      value: formatScaledNumber(value / 1_000_000_000, locale, 1),
    };
  }
  if (absolute >= 1_000_000) {
    return {
      unitLabel: t("metric.costUnit.millionUsd"),
      value: formatScaledNumber(value / 1_000_000, locale, 1),
    };
  }
  if (absolute >= 1_000) {
    return {
      unitLabel: t("metric.costUnit.thousandUsd"),
      value: formatScaledNumber(value / 1_000, locale, 1),
    };
  }
  return {
    unitLabel: t("metric.costUnit.usd"),
    value: formatScaledNumber(value, locale, value >= 100 ? 0 : 2),
  };
}

function formatScaledNumber(value: number, locale: string, maximumFractionDigits: number) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}
