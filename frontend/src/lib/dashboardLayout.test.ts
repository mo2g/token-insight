import { describe, expect, test } from "vitest";
import type { LayoutItem } from "react-grid-layout";
import {
  DASHBOARD_CARD_ORDER,
  defaultDashboardLayout,
  isCustomDashboardLayout,
  normalizeDashboardLayout,
} from "./dashboardLayout";

describe("dashboardLayout", () => {
  test("provides all cards in default order", () => {
    const layout = defaultDashboardLayout("console");
    expect(layout.map((item) => item.i)).toEqual(DASHBOARD_CARD_ORDER);
    expect(layout.find((item) => item.i === "metrics")).toMatchObject({ x: 0, y: 0, w: 7, h: 12 });
    expect(layout.find((item) => item.i === "models")).toMatchObject({ x: 7, y: 0, w: 5, h: 12 });
    expect(layout.find((item) => item.i === "trend")?.w).toBe(12);
    expect(layout.find((item) => item.i === "trend")?.y).toBe(12);
    expect(layout.find((item) => item.i === "sources")).toMatchObject({ x: 0, y: 23 });
    expect(layout.find((item) => item.i === "rankSources")).toMatchObject({ x: 5, y: 23 });
    expect(layout.find((item) => item.i === "heatmap")).toMatchObject({ x: 0, y: 33, w: 7 });
    expect(layout.find((item) => item.i === "health")).toMatchObject({ x: 7, y: 33, w: 5 });
  });

  test("normalizes card bounds and restores missing cards", () => {
    const layout = normalizeDashboardLayout("dock", [
      { i: "metrics", x: -10, y: -1, w: 1, h: 20 },
      { i: "trend", x: 11, y: 2, w: 30, h: 2 },
    ] as LayoutItem[]);

    expect(layout).toHaveLength(DASHBOARD_CARD_ORDER.length);
    const metrics = layout.find((item) => item.i === "metrics");
    expect(metrics?.x).toBe(0);
    expect(metrics?.w).toBeGreaterThanOrEqual(7);
    expect(metrics?.h).toBe(12);

    const trend = layout.find((item) => item.i === "trend");
    expect(trend?.w).toBe(12);
    expect(trend?.h).toBeGreaterThanOrEqual(11);
  });

  test("detects custom layout changes", () => {
    const base = defaultDashboardLayout("radar");
    expect(isCustomDashboardLayout("radar", base)).toBe(false);

    const custom = base.map((item) =>
      item.i === "trend" ? { ...item, h: item.h + 1 } : item,
    );
    expect(isCustomDashboardLayout("radar", custom)).toBe(true);
  });
});
