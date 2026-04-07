import type { Layout, LayoutItem } from "react-grid-layout";
import type { LayoutThemeId } from "./theme";

const STORAGE_KEY_PREFIX = "token-insight.dashboard-layout.v2";
export const DASHBOARD_GRID_COLUMNS = 12;
export const DASHBOARD_GRID_ROW_HEIGHT = 36;
export const DASHBOARD_GRID_MARGIN = [12, 12] as const;
export const DASHBOARD_GRID_CONTAINER_PADDING = [0, 0] as const;
const MAX_CARD_HEIGHT = 32;

export const DASHBOARD_CARD_ORDER = [
  "metrics",
  "models",
  "trend",
  "sources",
  "rankSources",
  "compare",
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
  metrics: { minW: 7, minH: 14, maxW: DASHBOARD_GRID_COLUMNS, fixedHeight: 14 },
  models: { minW: 5, minH: 12, maxH: MAX_CARD_HEIGHT },
  trend: { minW: 9, minH: 11, maxH: MAX_CARD_HEIGHT },
  sources: { minW: 5, minH: 10, maxH: MAX_CARD_HEIGHT },
  rankSources: { minW: 6, minH: 10, maxH: MAX_CARD_HEIGHT },
  compare: { minW: 8, minH: 12, maxH: MAX_CARD_HEIGHT },
  heatmap: { minW: 4, minH: 11, maxH: MAX_CARD_HEIGHT },
  health: { minW: 4, minH: 10, maxH: MAX_CARD_HEIGHT },
};

const DEFAULT_LAYOUTS: Record<LayoutThemeId, LayoutItem[]> = {
  console: [
    { i: "metrics", x: 0, y: 0, w: 7, h: 14 },
    { i: "models", x: 7, y: 0, w: 5, h: 14 },
    { i: "trend", x: 0, y: 14, w: 12, h: 11 },
    { i: "sources", x: 0, y: 25, w: 5, h: 10 },
    { i: "rankSources", x: 5, y: 25, w: 7, h: 10 },
    { i: "compare", x: 0, y: 35, w: 12, h: 14 },
    { i: "heatmap", x: 0, y: 49, w: 5, h: 11 },
    { i: "health", x: 5, y: 49, w: 7, h: 10 },
  ],
  dock: [
    { i: "trend", x: 0, y: 0, w: 12, h: 11 },
    { i: "models", x: 0, y: 14, w: 5, h: 14 },
    { i: "metrics", x: 5, y: 14, w: 7, h: 14 },

    { i: "sources", x: 0, y: 25, w: 5, h: 10 },
    { i: "rankSources", x: 5, y: 25, w: 7, h: 10 },
    { i: "compare", x: 0, y: 35, w: 12, h: 14 },
    { i: "heatmap", x: 0, y: 49, w: 5, h: 11 },
    { i: "health", x: 5, y: 49, w: 7, h: 10 },
  ],
  radar: [
    { i: "models", x: 0, y: 0, w: 5, h: 14 },
    { i: "metrics", x: 5, y: 0, w: 7, h: 14 },
    { i: "trend", x: 0, y: 14, w: 12, h: 11 },
    { i: "rankSources", x: 0, y: 25, w: 7, h: 10 },
    { i: "sources", x: 7, y: 25, w: 5, h: 10 },
    { i: "compare", x: 0, y: 35, w: 12, h: 14 },
    { i: "health", x: 0, y: 49, w: 7, h: 10 },
    { i: "heatmap", x: 7, y: 49, w: 5, h: 11 },
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
  const w = clamp(round(item.w, limit.minW), limit.minW, limit.maxW ?? DASHBOARD_GRID_COLUMNS);
  const x = clamp(round(item.x, 0), 0, Math.max(0, DASHBOARD_GRID_COLUMNS - w));
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
    maxW: limit.maxW ?? DASHBOARD_GRID_COLUMNS,
    maxH: limit.fixedHeight ?? limit.maxH ?? MAX_CARD_HEIGHT,
  };
}

export function gridRowsForPixelHeight(heightPx: number) {
  if (!Number.isFinite(heightPx) || heightPx <= 0) return 1;
  const [, marginY] = DASHBOARD_GRID_MARGIN;
  return Math.max(
    1,
    Math.ceil((heightPx + marginY) / (DASHBOARD_GRID_ROW_HEIGHT + marginY)),
  );
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
