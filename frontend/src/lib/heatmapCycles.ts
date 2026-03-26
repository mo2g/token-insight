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
