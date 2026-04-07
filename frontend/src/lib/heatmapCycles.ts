import type { ContributionCell } from "./api";

const STORAGE_KEY = "token-insight.heatmap-cycle.v1";
const ORDER_STORAGE_KEY = "token-insight.heatmap-cycle-order.v1";
const DEFAULT_CYCLE_DAYS = 7;
const MIN_CYCLE_DAYS = 3;
const MAX_CYCLE_DAYS = 60;
const HISTORY_CYCLE_COUNT = 4;

export type HeatmapCycleSettings = {
  resetDate: string;
  cycleDays: number;
};

export type HeatmapCycleDay = {
  day: string;
  totalTokens: number;
  totalCostUsd: number;
  active: boolean;
  level: number;
};

export type HeatmapCycle = {
  id: string;
  index: number;
  startDay: string;
  endDay: string;
  totalTokens: number;
  totalCostUsd: number;
  activeDays: number;
  days: HeatmapCycleDay[];
};

export type HeatmapCycleBundle = {
  cycles: HeatmapCycle[];
  cycleDays: number;
  currentCycleEnd: string;
  maxTokens: number;
};

export type HeatmapCycleComparisonPoint = [number, number];

export type HeatmapCycleComparisonDistributionDay = {
  index: number;
  label: string;
  day: string;
  totalTokens: number | null;
  totalCostUsd: number | null;
  available: boolean;
};

export type HeatmapCycleComparisonDayStats = {
  index: number;
  label: string;
  sampleCount: number;
  meanTokens?: number;
  medianTokens?: number;
  stdDevTokens?: number;
  minTokens?: number;
  maxTokens?: number;
};

export type HeatmapCycleComparisonCycle = HeatmapCycle & {
  elapsedDays: number;
  availableDays: number;
  observedActiveDays: number;
  observedTotalTokens: number;
  observedTotalCostUsd: number;
  tokensPerDay?: number;
  costPerDay?: number;
  observedTokensPerDay?: number;
  observedCostPerDay?: number;
  projectedTotalTokens?: number;
  projectedTotalCostUsd?: number;
  observedProjectedTotalTokens?: number;
  observedProjectedTotalCostUsd?: number;
  peakDay?: string;
  peakDayTokens: number;
  peakDayCostUsd: number;
  observedPeakDay?: string;
  observedPeakDayTokens: number;
  observedPeakDayCostUsd: number;
  curvePoints: HeatmapCycleComparisonPoint[];
  distributionDays: HeatmapCycleComparisonDistributionDay[];
  dayDeltaMeanTokens?: number;
  dayDeltaMeanPct?: number;
  frontHalfTokens?: number;
  backHalfTokens?: number;
  frontHalfShare?: number;
  backHalfShare?: number;
};

export type HeatmapCycleComparisonStats = {
  historyCycleCount: number;
  baselineTotalTokensMean?: number;
  baselineTotalTokensMedian?: number;
  baselineTokensPerDayMean?: number;
  baselineTokensPerDayMedian?: number;
  baselineActiveDaysMean?: number;
  baselineActiveDaysMedian?: number;
  baselineTotalCostUsdMean?: number;
  baselineTotalCostUsdMedian?: number;
  baselineCostPerDayMean?: number;
  baselineCostPerDayMedian?: number;
  alignedDayMeanTokens?: number;
  alignedDayMedianTokens?: number;
  alignedDayVolatilityMeanTokens?: number;
  alignedDayVolatilityMedianTokens?: number;
  dayStats: HeatmapCycleComparisonDayStats[];
  current: {
    totalTokens: number;
    totalCostUsd: number;
    observedTotalTokens: number;
    observedTotalCostUsd: number;
    activeDays: number;
    observedDays: number;
    observedActiveDays: number;
    elapsedDays: number;
    tokensPerDay?: number;
    costPerDay?: number;
    observedTokensPerDay?: number;
    observedCostPerDay?: number;
    projectedTotalTokens?: number;
    projectedTotalCostUsd?: number;
    observedProjectedTotalTokens?: number;
    observedProjectedTotalCostUsd?: number;
    peakDay?: string;
    peakDayTokens: number;
    peakDayCostUsd: number;
    observedPeakDay?: string;
    observedPeakDayTokens: number;
    observedPeakDayCostUsd: number;
    dayDeltaMeanTokens?: number;
    dayDeltaMeanPct?: number;
    frontHalfTokens?: number;
    backHalfTokens?: number;
    frontHalfShare?: number;
    backHalfShare?: number;
  };
  previous?: {
    totalTokens: number;
    totalCostUsd: number;
    observedTotalTokens: number;
    observedTotalCostUsd: number;
    activeDays: number;
    observedDays: number;
    observedActiveDays: number;
    tokensPerDay?: number;
    costPerDay?: number;
    observedTokensPerDay?: number;
    observedCostPerDay?: number;
    dayDeltaMeanTokens?: number;
    dayDeltaMeanPct?: number;
    frontHalfTokens?: number;
    backHalfTokens?: number;
    frontHalfShare?: number;
    backHalfShare?: number;
  };
  currentVsPreviousTokens?: number;
  currentVsPreviousTokensPct?: number;
  currentVsPreviousCostUsd?: number;
  currentVsPreviousCostUsdPct?: number;
  currentObservedVsPreviousTokens?: number;
  currentObservedVsPreviousTokensPct?: number;
  currentObservedVsPreviousCostUsd?: number;
  currentObservedVsPreviousCostUsdPct?: number;
  currentVsBaselineMeanTokens?: number;
  currentVsBaselineMeanTokensPct?: number;
  currentObservedVsBaselineMeanTokens?: number;
  currentObservedVsBaselineMeanTokensPct?: number;
  currentVsBaselineMedianTokens?: number;
  currentVsBaselineMedianTokensPct?: number;
  currentObservedVsBaselineMedianTokens?: number;
  currentObservedVsBaselineMedianTokensPct?: number;
};

export type HeatmapCycleComparisonBundle = {
  cycles: HeatmapCycleComparisonCycle[];
  stats: HeatmapCycleComparisonStats;
  cycleDays: number;
  currentCycleEnd: string;
  maxTokens: number;
};

export function loadHeatmapCycleSettings(now = new Date()): HeatmapCycleSettings {
  if (typeof window === "undefined") {
    return defaultCycleSettings(now);
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultCycleSettings(now);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<HeatmapCycleSettings>;
    return normalizeHeatmapCycleSettings(
      {
        resetDate: parsed.resetDate ?? "",
        cycleDays: parsed.cycleDays ?? DEFAULT_CYCLE_DAYS,
      },
      now,
    );
  } catch {
    return defaultCycleSettings(now);
  }
}

export function saveHeatmapCycleSettings(settings: HeatmapCycleSettings) {
  if (typeof window === "undefined") return;
  const normalized = normalizeHeatmapCycleSettings(settings);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function defaultHeatmapCycleOrder() {
  return Array.from({ length: HISTORY_CYCLE_COUNT }, (_, index) => `cycle-${index}`);
}

export function loadHeatmapCycleOrder() {
  if (typeof window === "undefined") {
    return defaultHeatmapCycleOrder();
  }
  const raw = window.localStorage.getItem(ORDER_STORAGE_KEY);
  if (!raw) {
    return defaultHeatmapCycleOrder();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return defaultHeatmapCycleOrder();
    }
    return normalizeHeatmapCycleOrder(parsed);
  } catch {
    return defaultHeatmapCycleOrder();
  }
}

export function saveHeatmapCycleOrder(order: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ORDER_STORAGE_KEY,
    JSON.stringify(normalizeHeatmapCycleOrder(order)),
  );
}

export function normalizeHeatmapCycleOrder(order: string[]) {
  const defaults = defaultHeatmapCycleOrder();
  const remaining = new Set(defaults);
  const normalized: string[] = [];

  for (const item of order) {
    if (!remaining.has(item)) continue;
    remaining.delete(item);
    normalized.push(item);
  }

  return [...normalized, ...remaining];
}

export function moveHeatmapCycleOrder(order: string[], activeId: string, targetId: string) {
  const normalized = normalizeHeatmapCycleOrder(order);
  const fromIndex = normalized.indexOf(activeId);
  const toIndex = normalized.indexOf(targetId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return normalized;
  }

  const next = [...normalized];
  const [active] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, active);
  return next;
}

export function reorderHeatmapCycles(cycles: HeatmapCycle[], order: string[]) {
  const byId = new Map(cycles.map((cycle) => [cycle.id, cycle]));
  return normalizeHeatmapCycleOrder(order)
    .map((id) => byId.get(id))
    .filter((cycle): cycle is HeatmapCycle => Boolean(cycle));
}

export function normalizeHeatmapCycleSettings(
  settings: HeatmapCycleSettings,
  now = new Date(),
): HeatmapCycleSettings {
  const fallback = defaultCycleSettings(now);
  const resetDate = parseDay(settings.resetDate) ? settings.resetDate : fallback.resetDate;
  const cycleDays = clamp(
    Math.round(settings.cycleDays || DEFAULT_CYCLE_DAYS),
    MIN_CYCLE_DAYS,
    MAX_CYCLE_DAYS,
  );
  return { resetDate, cycleDays };
}

export function buildHeatmapCycles(
  cells: ContributionCell[],
  settings: HeatmapCycleSettings,
  now = new Date(),
): HeatmapCycleBundle {
  const normalized = normalizeHeatmapCycleSettings(settings, now);
  const cycleEnd = resolveCurrentCycleEnd(normalized, now);
  const byDay = new Map(cells.map((cell) => [cell.day, cell]));
  const rawCycles: Array<Omit<HeatmapCycle, "days"> & { days: Omit<HeatmapCycleDay, "level">[] }> = [];

  for (let cycleIndex = 0; cycleIndex < HISTORY_CYCLE_COUNT; cycleIndex += 1) {
    const endDate = addDays(cycleEnd, -(cycleIndex * normalized.cycleDays));
    const startDate = addDays(endDate, -(normalized.cycleDays - 1));
    const days: Omit<HeatmapCycleDay, "level">[] = [];
    let totalTokens = 0;
    let totalCostUsd = 0;
    let activeDays = 0;

    for (let offset = 0; offset < normalized.cycleDays; offset += 1) {
      const current = addDays(startDate, offset);
      const day = formatDay(current);
      const source = byDay.get(day);
      const totalTokensForDay = source?.total_tokens ?? 0;
      const totalCostUsdForDay = source?.total_cost_usd ?? 0;
      const active = totalTokensForDay > 0;
      if (active) {
        activeDays += 1;
      }
      totalTokens += totalTokensForDay;
      totalCostUsd += totalCostUsdForDay;
      days.push({
        day,
        totalTokens: totalTokensForDay,
        totalCostUsd: totalCostUsdForDay,
        active,
      });
    }

    rawCycles.push({
      id: `cycle-${cycleIndex}`,
      index: cycleIndex,
      startDay: formatDay(startDate),
      endDay: formatDay(endDate),
      totalTokens,
      totalCostUsd,
      activeDays,
      days,
    });
  }

  const maxTokens = Math.max(
    0,
    ...rawCycles.flatMap((cycle) => cycle.days.map((day) => day.totalTokens)),
  );

  const cycles: HeatmapCycle[] = rawCycles.map((cycle) => ({
    ...cycle,
    days: cycle.days.map((day) => ({
      ...day,
      level: levelForTokens(day.totalTokens, maxTokens),
    })),
  }));

  return {
    cycles,
    cycleDays: normalized.cycleDays,
    currentCycleEnd: formatDay(cycleEnd),
    maxTokens,
  };
}

export function buildHeatmapCycleComparison(
  cells: ContributionCell[],
  settings: HeatmapCycleSettings,
  now = new Date(),
): HeatmapCycleComparisonBundle {
  const bundle = buildHeatmapCycles(cells, settings, now);
  const today = formatDay(startOfUtcDay(now));
  const cycles = bundle.cycles.map((cycle) => {
    const elapsedDays = countElapsedDays(cycle.days, today);
    const distributionDays = buildDistributionDays(cycle, today);
    const availableDays = distributionDays.filter((day) => day.available).length;
    const observedActiveDays = distributionDays.filter(
      (day) => day.available && (day.totalTokens ?? 0) > 0,
    ).length;
    const observedTotalTokens = sum(
      distributionDays.filter((day) => day.available).map((day) => day.totalTokens ?? 0),
    );
    const observedTotalCostUsd = sum(
      distributionDays.filter((day) => day.available).map((day) => day.totalCostUsd ?? 0),
    );
    const peakDay = findPeakDay(cycle.days);
    const observedPeakDay = findPeakDistributionDay(distributionDays);
    const tokensPerDay = elapsedDays > 0 ? cycle.totalTokens / elapsedDays : undefined;
    const costPerDay = elapsedDays > 0 ? cycle.totalCostUsd / elapsedDays : undefined;
    const observedTokensPerDay = availableDays > 0 ? observedTotalTokens / availableDays : undefined;
    const observedCostPerDay = availableDays > 0 ? observedTotalCostUsd / availableDays : undefined;
    const projectedTotalTokens =
      typeof tokensPerDay === "number" ? tokensPerDay * cycle.days.length : undefined;
    const projectedTotalCostUsd =
      typeof costPerDay === "number" ? costPerDay * cycle.days.length : undefined;
    const observedProjectedTotalTokens =
      typeof observedTokensPerDay === "number"
        ? observedTokensPerDay * cycle.days.length
        : undefined;
    const observedProjectedTotalCostUsd =
      typeof observedCostPerDay === "number"
        ? observedCostPerDay * cycle.days.length
        : undefined;
    const splitIndex = Math.ceil(cycle.days.length / 2);
    const frontHalfTokens = sum(
      distributionDays
        .slice(0, splitIndex)
        .map((day) => (day.available ? day.totalTokens ?? 0 : 0)),
    );
    const backHalfTokens = sum(
      distributionDays
        .slice(splitIndex)
        .map((day) => (day.available ? day.totalTokens ?? 0 : 0)),
    );
    const observedSplitTokens = frontHalfTokens + backHalfTokens;
    const frontHalfShare =
      observedSplitTokens > 0 ? (frontHalfTokens / observedSplitTokens) * 100 : undefined;
    const backHalfShare =
      observedSplitTokens > 0 ? (backHalfTokens / observedSplitTokens) * 100 : undefined;

    return {
      ...cycle,
      elapsedDays,
      availableDays,
      observedActiveDays,
      observedTotalTokens,
      observedTotalCostUsd,
      tokensPerDay,
      costPerDay,
      observedTokensPerDay,
      observedCostPerDay,
      projectedTotalTokens,
      projectedTotalCostUsd,
      observedProjectedTotalTokens,
      observedProjectedTotalCostUsd,
      peakDay: peakDay?.day,
      peakDayTokens: peakDay?.totalTokens ?? 0,
      peakDayCostUsd: peakDay?.totalCostUsd ?? 0,
      observedPeakDay: observedPeakDay?.day,
      observedPeakDayTokens: observedPeakDay?.totalTokens ?? 0,
      observedPeakDayCostUsd: observedPeakDay?.totalCostUsd ?? 0,
      curvePoints: buildCurvePoints(cycle, availableDays, observedProjectedTotalTokens, observedTotalTokens),
      distributionDays,
      dayDeltaMeanTokens: averageAbsoluteDelta(
        distributionDays
          .filter((day) => day.available)
          .map((day) => day.totalTokens ?? 0),
      ),
      dayDeltaMeanPct: averageAbsoluteDeltaPct(
        distributionDays
          .filter((day) => day.available)
          .map((day) => day.totalTokens ?? 0),
      ),
      frontHalfTokens,
      backHalfTokens,
      frontHalfShare,
      backHalfShare,
    };
  });

  const previousCycles = cycles.slice(1);
  const baselineTotalTokens = previousCycles.map((cycle) => cycle.totalTokens);
  const baselineTokensPerDay = previousCycles.map((cycle) => cycle.tokensPerDay ?? 0);
  const baselineActiveDays = previousCycles.map((cycle) => cycle.activeDays);
  const baselineTotalCostUsd = previousCycles.map((cycle) => cycle.totalCostUsd);
  const baselineCostPerDay = previousCycles.map((cycle) => cycle.costPerDay ?? 0);
  const baselineTotalTokensMean = mean(baselineTotalTokens);
  const baselineTotalTokensMedian = median(baselineTotalTokens);
  const baselineTokensPerDayMean = mean(baselineTokensPerDay);
  const baselineTokensPerDayMedian = median(baselineTokensPerDay);
  const baselineActiveDaysMean = mean(baselineActiveDays);
  const baselineActiveDaysMedian = median(baselineActiveDays);
  const baselineTotalCostUsdMean = mean(baselineTotalCostUsd);
  const baselineTotalCostUsdMedian = median(baselineTotalCostUsd);
  const baselineCostPerDayMean = mean(baselineCostPerDay);
  const baselineCostPerDayMedian = median(baselineCostPerDay);
  const dayStats = buildDayStats(cycles);
  const alignedDayMeanTokens = mean(dayStats.map((day) => day.meanTokens).filter(isNumber));
  const alignedDayMedianTokens = median(dayStats.map((day) => day.medianTokens).filter(isNumber));
  const alignedDayVolatilityMeanTokens = mean(
    dayStats.map((day) => day.stdDevTokens).filter(isNumber),
  );
  const alignedDayVolatilityMedianTokens = median(
    dayStats.map((day) => day.stdDevTokens).filter(isNumber),
  );
  const current = cycles[0];
  const previous = cycles[1];

  const currentVsPreviousTokens = previous
    ? current.totalTokens - previous.totalTokens
    : undefined;
  const currentVsPreviousTokensPct = percentChange(
    current.totalTokens,
    previous?.totalTokens,
  );
  const currentVsPreviousCostUsd = previous
    ? current.totalCostUsd - previous.totalCostUsd
    : undefined;
  const currentVsPreviousCostUsdPct = percentChange(
    current.totalCostUsd,
    previous?.totalCostUsd,
  );
  const currentObservedVsPreviousTokens = previous
    ? current.observedTotalTokens - previous.observedTotalTokens
    : undefined;
  const currentObservedVsPreviousTokensPct = percentChange(
    current.observedTotalTokens,
    previous?.observedTotalTokens,
  );
  const currentObservedVsPreviousCostUsd = previous
    ? current.observedTotalCostUsd - previous.observedTotalCostUsd
    : undefined;
  const currentObservedVsPreviousCostUsdPct = percentChange(
    current.observedTotalCostUsd,
    previous?.observedTotalCostUsd,
  );
  const currentVsBaselineMeanTokens =
    typeof baselineTotalTokensMean === "number"
      ? current.totalTokens - baselineTotalTokensMean
      : undefined;
  const currentVsBaselineMeanTokensPct = percentChange(
    current.totalTokens,
    baselineTotalTokensMean,
  );
  const currentObservedVsBaselineMeanTokens =
    typeof baselineTotalTokensMean === "number"
      ? current.observedTotalTokens - baselineTotalTokensMean
      : undefined;
  const currentObservedVsBaselineMeanTokensPct = percentChange(
    current.observedTotalTokens,
    baselineTotalTokensMean,
  );
  const currentVsBaselineMedianTokens =
    typeof baselineTotalTokensMedian === "number"
      ? current.totalTokens - baselineTotalTokensMedian
      : undefined;
  const currentVsBaselineMedianTokensPct = percentChange(
    current.totalTokens,
    baselineTotalTokensMedian,
  );
  const currentObservedVsBaselineMedianTokens =
    typeof baselineTotalTokensMedian === "number"
      ? current.observedTotalTokens - baselineTotalTokensMedian
      : undefined;
  const currentObservedVsBaselineMedianTokensPct = percentChange(
    current.observedTotalTokens,
    baselineTotalTokensMedian,
  );

  return {
    ...bundle,
    cycles,
    stats: {
      historyCycleCount: previousCycles.length,
      baselineTotalTokensMean,
      baselineTotalTokensMedian,
      baselineTokensPerDayMean,
      baselineTokensPerDayMedian,
      baselineActiveDaysMean,
      baselineActiveDaysMedian,
      baselineTotalCostUsdMean,
      baselineTotalCostUsdMedian,
      baselineCostPerDayMean,
      baselineCostPerDayMedian,
      alignedDayMeanTokens,
      alignedDayMedianTokens,
      alignedDayVolatilityMeanTokens,
      alignedDayVolatilityMedianTokens,
      dayStats,
      current: {
        totalTokens: current.totalTokens,
        totalCostUsd: current.totalCostUsd,
        observedTotalTokens: current.observedTotalTokens,
        observedTotalCostUsd: current.observedTotalCostUsd,
        activeDays: current.activeDays,
        observedDays: current.availableDays,
        observedActiveDays: current.observedActiveDays,
        elapsedDays: current.elapsedDays,
        tokensPerDay: current.tokensPerDay,
        costPerDay: current.costPerDay,
        observedTokensPerDay: current.observedTokensPerDay,
        observedCostPerDay: current.observedCostPerDay,
        projectedTotalTokens: current.projectedTotalTokens,
        projectedTotalCostUsd: current.projectedTotalCostUsd,
        observedProjectedTotalTokens: current.observedProjectedTotalTokens,
        observedProjectedTotalCostUsd: current.observedProjectedTotalCostUsd,
        peakDay: current.peakDay,
        peakDayTokens: current.peakDayTokens,
        peakDayCostUsd: current.peakDayCostUsd,
        observedPeakDay: current.observedPeakDay,
        observedPeakDayTokens: current.observedPeakDayTokens,
        observedPeakDayCostUsd: current.observedPeakDayCostUsd,
        dayDeltaMeanTokens: current.dayDeltaMeanTokens,
        dayDeltaMeanPct: current.dayDeltaMeanPct,
        frontHalfTokens: current.frontHalfTokens,
        backHalfTokens: current.backHalfTokens,
        frontHalfShare: current.frontHalfShare,
        backHalfShare: current.backHalfShare,
      },
      previous: previous
        ? {
            totalTokens: previous.totalTokens,
            totalCostUsd: previous.totalCostUsd,
            observedTotalTokens: previous.observedTotalTokens,
            observedTotalCostUsd: previous.observedTotalCostUsd,
            activeDays: previous.activeDays,
            observedDays: previous.availableDays,
            observedActiveDays: previous.observedActiveDays,
            tokensPerDay: previous.tokensPerDay,
            costPerDay: previous.costPerDay,
            observedTokensPerDay: previous.observedTokensPerDay,
            observedCostPerDay: previous.observedCostPerDay,
            dayDeltaMeanTokens: previous.dayDeltaMeanTokens,
            dayDeltaMeanPct: previous.dayDeltaMeanPct,
            frontHalfTokens: previous.frontHalfTokens,
            backHalfTokens: previous.backHalfTokens,
            frontHalfShare: previous.frontHalfShare,
            backHalfShare: previous.backHalfShare,
          }
        : undefined,
      currentVsPreviousTokens,
      currentVsPreviousTokensPct,
      currentVsPreviousCostUsd,
      currentVsPreviousCostUsdPct,
      currentObservedVsPreviousTokens,
      currentObservedVsPreviousTokensPct,
      currentObservedVsPreviousCostUsd,
      currentObservedVsPreviousCostUsdPct,
      currentVsBaselineMeanTokens,
      currentVsBaselineMeanTokensPct,
      currentObservedVsBaselineMeanTokens,
      currentObservedVsBaselineMeanTokensPct,
      currentVsBaselineMedianTokens,
      currentVsBaselineMedianTokensPct,
      currentObservedVsBaselineMedianTokens,
      currentObservedVsBaselineMedianTokensPct,
    },
  };
}

function resolveCurrentCycleEnd(settings: HeatmapCycleSettings, now: Date) {
  let end = parseDay(settings.resetDate) ?? addDays(startOfUtcDay(now), settings.cycleDays);
  const today = startOfUtcDay(now);

  while (end < today) {
    end = addDays(end, settings.cycleDays);
  }

  return end;
}

function defaultCycleSettings(now: Date): HeatmapCycleSettings {
  const today = startOfUtcDay(now);
  return {
    resetDate: formatDay(addDays(today, DEFAULT_CYCLE_DAYS)),
    cycleDays: DEFAULT_CYCLE_DAYS,
  };
}

function levelForTokens(tokens: number, maxTokens: number) {
  if (tokens <= 0 || maxTokens <= 0) return 0;
  const ratio = tokens / maxTokens;
  if (ratio < 0.2) return 1;
  if (ratio < 0.4) return 2;
  if (ratio < 0.6) return 3;
  if (ratio < 0.8) return 4;
  return 5;
}

function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function countElapsedDays(days: HeatmapCycle["days"], today: string) {
  return days.reduce((count, day) => (day.day <= today ? count + 1 : count), 0);
}

function findPeakDay(days: HeatmapCycle["days"]) {
  let peak = days[0];
  for (const day of days) {
    if (!peak || day.totalTokens > peak.totalTokens) {
      peak = day;
    }
  }

  if (!peak || peak.totalTokens <= 0) {
    return null;
  }

  return peak;
}

function findPeakDistributionDay(days: HeatmapCycleComparisonDistributionDay[]) {
  let peak: HeatmapCycleComparisonDistributionDay | null = null;
  for (const day of days) {
    if (!day.available || typeof day.totalTokens !== "number") {
      continue;
    }
    if (!peak || day.totalTokens > (peak.totalTokens ?? 0)) {
      peak = day;
    }
  }

  if (!peak || (peak.totalTokens ?? 0) <= 0) {
    return null;
  }

  return peak;
}

function buildCurvePoints(
  cycle: HeatmapCycle,
  availableDays: number,
  projectedTotalTokens?: number,
  observedTotalTokens?: number,
) {
  const denominator =
    cycle.index === 0 ? projectedTotalTokens ?? observedTotalTokens ?? cycle.totalTokens : cycle.totalTokens;
  const safeDenominator = denominator > 0 ? denominator : 0;
  const currentTokens = observedTotalTokens ?? cycle.totalTokens;
  const runRate = availableDays > 0 ? currentTokens / availableDays : undefined;
  const points: HeatmapCycleComparisonPoint[] = [];
  let cumulativeTokens = 0;

  for (let index = 0; index < cycle.days.length; index += 1) {
    const progress =
      cycle.days.length <= 1 ? 100 : (index / (cycle.days.length - 1)) * 100;

    if (cycle.index === 0 && typeof runRate === "number") {
      if (index < availableDays) {
        cumulativeTokens += cycle.days[index]?.totalTokens ?? 0;
      } else {
        cumulativeTokens = currentTokens + runRate * (index + 1 - availableDays);
      }
    } else {
      cumulativeTokens += cycle.days[index]?.totalTokens ?? 0;
    }

    const share = safeDenominator > 0 ? (cumulativeTokens / safeDenominator) * 100 : 0;
    points.push([progress, share]);
  }

  return points;
}

function buildDistributionDays(cycle: HeatmapCycle, today: string) {
  return cycle.days.map((day, index) => {
    const available = cycle.index !== 0 || day.day <= today;
    return {
      index,
      label: dayLabel(index),
      day: day.day,
      totalTokens: available ? day.totalTokens : null,
      totalCostUsd: available ? day.totalCostUsd : null,
      available,
    };
  });
}

function buildDayStats(cycles: HeatmapCycleComparisonCycle[]) {
  const dayCount = cycles[0]?.distributionDays.length ?? 0;
  const stats: HeatmapCycleComparisonDayStats[] = [];

  for (let index = 0; index < dayCount; index += 1) {
    const values = cycles
      .map((cycle) => cycle.distributionDays[index])
      .filter((point): point is HeatmapCycleComparisonDistributionDay => Boolean(point))
      .filter((point) => point.available)
      .map((point) => point.totalTokens ?? 0);

    stats.push({
      index,
      label: dayLabel(index),
      sampleCount: values.length,
      meanTokens: mean(values),
      medianTokens: median(values),
      stdDevTokens: stdDev(values),
      minTokens: values.length > 0 ? Math.min(...values) : undefined,
      maxTokens: values.length > 0 ? Math.max(...values) : undefined,
    });
  }

  return stats;
}

function dayLabel(index: number) {
  return `D${index + 1}`;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
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

function averageAbsoluteDeltaPct(values: number[]) {
  if (values.length < 2) {
    return undefined;
  }

  const ratios: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    if (previous <= 0) {
      continue;
    }
    ratios.push((Math.abs(values[index] - previous) / previous) * 100);
  }

  return mean(ratios);
}

function stdDev(values: number[]) {
  if (values.length < 2) {
    return undefined;
  }

  const average = mean(values);
  if (typeof average !== "number") {
    return undefined;
  }

  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

function mean(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentChange(current: number, previous?: number) {
  if (typeof previous !== "number" || previous <= 0) {
    return undefined;
  }

  return ((current - previous) / previous) * 100;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function formatDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, delta: number) {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + delta);
  return next;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
