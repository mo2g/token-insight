import type { Layout, LayoutItem } from "react-grid-layout";
import type { LayoutThemeId } from "./theme";

const STORAGE_KEY_PREFIX = "token-insight.dashboard-layout.v2";
const GRID_COLUMNS = 12;
const MAX_CARD_HEIGHT = 32;

export const DASHBOARD_CARD_ORDER = [
  "metrics",
  "models",
  "trend",
  "sources",
  "rankSources",
  "heatmap",
  "health",
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARD_ORDER)[number];

type CardLimit = {
  minW: number;
  minH: number;
  maxW?: number;
  maxH?: number;
  fixedHeight?: number;
};

const CARD_LIMITS: Record<DashboardCardId, CardLimit> = {
  metrics: { minW: 7, minH: 12, maxW: GRID_COLUMNS, fixedHeight: 12 },
  models: { minW: 5, minH: 12, maxH: MAX_CARD_HEIGHT },
  trend: { minW: 9, minH: 11, maxH: MAX_CARD_HEIGHT },
  sources: { minW: 5, minH: 10, maxH: MAX_CARD_HEIGHT },
  rankSources: { minW: 6, minH: 10, maxH: MAX_CARD_HEIGHT },
  heatmap: { minW: 5, minH: 11, maxH: MAX_CARD_HEIGHT },
  health: { minW: 5, minH: 10, maxH: MAX_CARD_HEIGHT },
};

const DEFAULT_LAYOUTS: Record<LayoutThemeId, LayoutItem[]> = {
  console: [
    { i: "metrics", x: 0, y: 0, w: 7, h: 12 },
    { i: "models", x: 7, y: 0, w: 5, h: 12 },
    { i: "trend", x: 0, y: 12, w: 12, h: 11 },
    { i: "sources", x: 0, y: 23, w: 5, h: 10 },
    { i: "rankSources", x: 5, y: 23, w: 7, h: 10 },
    { i: "heatmap", x: 0, y: 33, w: 7, h: 13 },
    { i: "health", x: 7, y: 33, w: 5, h: 13 },
  ],
  dock: [
    { i: "metrics", x: 0, y: 0, w: 7, h: 12 },
    { i: "models", x: 7, y: 0, w: 5, h: 12 },
    { i: "trend", x: 0, y: 12, w: 12, h: 11 },
    { i: "sources", x: 0, y: 23, w: 5, h: 10 },
    { i: "rankSources", x: 5, y: 23, w: 7, h: 10 },
    { i: "heatmap", x: 0, y: 33, w: 7, h: 13 },
    { i: "health", x: 7, y: 33, w: 5, h: 13 },
  ],
  radar: [
    { i: "metrics", x: 0, y: 0, w: 7, h: 12 },
    { i: "models", x: 7, y: 0, w: 5, h: 12 },
    { i: "trend", x: 0, y: 12, w: 12, h: 11 },
    { i: "sources", x: 0, y: 23, w: 5, h: 10 },
    { i: "rankSources", x: 5, y: 23, w: 7, h: 10 },
    { i: "heatmap", x: 0, y: 33, w: 7, h: 13 },
    { i: "health", x: 7, y: 33, w: 5, h: 13 },
  ],
};

export function defaultDashboardLayout(layoutTheme: LayoutThemeId): LayoutItem[] {
  return normalizeDashboardLayout(layoutTheme, DEFAULT_LAYOUTS[layoutTheme]);
}

export function normalizeDashboardLayout(
  layoutTheme: LayoutThemeId,
  input: Layout | LayoutItem[],
): LayoutItem[] {
  const defaults = DEFAULT_LAYOUTS[layoutTheme];
  const map = new Map(input.map((item) => [item.i, item]));
  return DASHBOARD_CARD_ORDER.map((cardId, index) => {
    const fallback = defaults[index];
    const item = map.get(cardId) ?? fallback;
    return normalizeItem(cardId, item);
  });
}

export function loadDashboardLayout(layoutTheme: LayoutThemeId): LayoutItem[] | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(layoutTheme));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const safe = parsed.filter(isLayoutLike) as LayoutItem[];
    if (safe.length === 0) {
      return null;
    }
    return normalizeDashboardLayout(layoutTheme, safe);
  } catch {
    return null;
  }
}

export function saveDashboardLayout(layoutTheme: LayoutThemeId, layout: Layout | LayoutItem[]) {
  if (typeof window === "undefined") return;
  const normalized = normalizeDashboardLayout(layoutTheme, layout);
  const compact = normalized.map((item) => ({
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  }));
  window.localStorage.setItem(storageKey(layoutTheme), JSON.stringify(compact));
}

export function clearDashboardLayout(layoutTheme: LayoutThemeId) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(layoutTheme));
}

export function isCustomDashboardLayout(
  layoutTheme: LayoutThemeId,
  layout: Layout | LayoutItem[],
) {
  return layoutSignature(normalizeDashboardLayout(layoutTheme, layout)) !==
    layoutSignature(defaultDashboardLayout(layoutTheme));
}

export function isFixedDashboardCard(cardId: DashboardCardId) {
  return cardId === "metrics";
}

function layoutSignature(layout: LayoutItem[]) {
  return layout
    .map((item) => `${item.i}:${item.x}:${item.y}:${item.w}:${item.h}`)
    .join("|");
}

function storageKey(layoutTheme: LayoutThemeId) {
  return `${STORAGE_KEY_PREFIX}.${layoutTheme}`;
}

function normalizeItem(cardId: DashboardCardId, item: LayoutItem): LayoutItem {
  const limit = CARD_LIMITS[cardId];
  const w = clamp(round(item.w, limit.minW), limit.minW, limit.maxW ?? GRID_COLUMNS);
  const x = clamp(round(item.x, 0), 0, Math.max(0, GRID_COLUMNS - w));
  const y = Math.max(0, round(item.y, 0));

  const h = limit.fixedHeight
    ? limit.fixedHeight
    : clamp(round(item.h, limit.minH), limit.minH, limit.maxH ?? MAX_CARD_HEIGHT);

  return {
    ...item,
    i: cardId,
    x,
    y,
    w,
    h,
    minW: limit.minW,
    minH: limit.fixedHeight ?? limit.minH,
    maxW: limit.maxW ?? GRID_COLUMNS,
    maxH: limit.fixedHeight ?? limit.maxH ?? MAX_CARD_HEIGHT,
  };
}

function isLayoutLike(value: unknown): value is LayoutItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.i === "string" &&
    typeof item.x === "number" &&
    typeof item.y === "number" &&
    typeof item.w === "number" &&
    typeof item.h === "number"
  );
}

function round(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
