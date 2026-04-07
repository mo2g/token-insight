import { beforeEach, describe, expect, test } from "vitest";
import type { ContributionCell } from "./api";
import {
  buildHeatmapCycles,
  buildHeatmapCycleComparison,
  loadHeatmapCycleOrder,
  moveHeatmapCycleOrder,
  normalizeHeatmapCycleSettings,
  normalizeHeatmapCycleOrder,
  saveHeatmapCycleOrder,
} from "./heatmapCycles";

const cells: ContributionCell[] = [
  {
    day: "2026-03-19",
    week_index: 0,
    weekday: 3,
    total_tokens: 120,
    total_cost_usd: 0.2,
    intensity: 0.4,
  },
  {
    day: "2026-03-21",
    week_index: 0,
    weekday: 5,
    total_tokens: 30,
    total_cost_usd: 0.05,
    intensity: 0.2,
  },
  {
    day: "2026-03-25",
    week_index: 0,
    weekday: 3,
    total_tokens: 80,
    total_cost_usd: 0.12,
    intensity: 0.3,
  },
  {
    day: "2026-03-12",
    week_index: 1,
    weekday: 3,
    total_tokens: 90,
    total_cost_usd: 0.15,
    intensity: 0.3,
  },
  {
    day: "2026-03-14",
    week_index: 1,
    weekday: 5,
    total_tokens: 60,
    total_cost_usd: 0.1,
    intensity: 0.25,
  },
  {
    day: "2026-03-06",
    week_index: 2,
    weekday: 5,
    total_tokens: 50,
    total_cost_usd: 0.08,
    intensity: 0.2,
  },
  {
    day: "2026-02-27",
    week_index: 3,
    weekday: 4,
    total_tokens: 70,
    total_cost_usd: 0.11,
    intensity: 0.25,
  },
];

describe("heatmapCycles", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
  });

  test("builds current + previous 3 cycles", () => {
    const data = buildHeatmapCycles(
      cells,
      { resetDate: "2026-03-25", cycleDays: 7 },
      new Date("2026-03-24T08:00:00Z"),
    );

    expect(data.cycles).toHaveLength(4);
    expect(data.currentCycleEnd).toBe("2026-03-25");
    expect(data.cycles[0]?.startDay).toBe("2026-03-19");
    expect(data.cycles[0]?.endDay).toBe("2026-03-25");
    expect(data.cycles[0]?.activeDays).toBe(3);
    expect(data.cycles[0]?.totalTokens).toBe(230);
    expect(data.cycles[1]?.startDay).toBe("2026-03-12");
  });

  test("builds cycle comparison stats and curves", () => {
    const data = buildHeatmapCycleComparison(
      cells,
      { resetDate: "2026-03-25", cycleDays: 7 },
      new Date("2026-03-24T08:00:00Z"),
    );
    const current = data.cycles[0];
    const previous = data.cycles[1];
    const currentCurvePoints = current?.curvePoints ?? [];
    const previousCurvePoints = previous?.curvePoints ?? [];

    expect(data.cycles).toHaveLength(4);
    expect(data.stats.current.totalTokens).toBe(230);
    expect(data.stats.current.observedTotalTokens).toBe(150);
    expect(data.stats.current.observedActiveDays).toBe(2);
    expect(data.stats.current.elapsedDays).toBe(6);
    expect(data.stats.current.projectedTotalTokens).toBeCloseTo(268.333, 3);
    expect(data.stats.current.observedProjectedTotalTokens).toBe(175);
    expect(data.stats.baselineTotalTokensMean).toBe(90);
    expect(data.stats.baselineTotalTokensMedian).toBe(70);
    expect(data.stats.currentVsPreviousTokens).toBe(80);
    expect(data.stats.currentObservedVsPreviousTokens).toBe(0);
    expect(data.stats.currentVsBaselineMeanTokens).toBe(140);
    expect(data.stats.currentObservedVsBaselineMeanTokens).toBe(60);
    expect(data.stats.currentVsBaselineMedianTokens).toBe(160);
    expect(data.stats.currentObservedVsBaselineMedianTokens).toBe(80);
    expect(data.stats.dayStats).toHaveLength(7);
    expect(data.stats.dayStats[0]?.meanTokens).toBe(52.5);
    expect(data.cycles[0]?.distributionDays[6]?.available).toBe(false);
    expect(data.cycles[0]?.distributionDays[6]?.totalTokens).toBeNull();
    expect(currentCurvePoints[currentCurvePoints.length - 1]?.[1]).toBeCloseTo(100, 5);
    expect(previousCurvePoints[previousCurvePoints.length - 1]?.[1]).toBeCloseTo(100, 5);
  });

  test("rolls cycle end forward when reset date is in the past", () => {
    const data = buildHeatmapCycles(
      cells,
      { resetDate: "2026-03-01", cycleDays: 7 },
      new Date("2026-03-25T08:00:00Z"),
    );

    expect(data.currentCycleEnd).toBe("2026-03-29");
  });

  test("clamps invalid cycle settings", () => {
    const normalized = normalizeHeatmapCycleSettings(
      { resetDate: "invalid", cycleDays: 1 },
      new Date("2026-03-25T08:00:00Z"),
    );

    expect(normalized.cycleDays).toBe(3);
    expect(normalized.resetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("normalizes and persists drag order", () => {
    expect(normalizeHeatmapCycleOrder(["cycle-3", "cycle-0", "unknown"])).toEqual([
      "cycle-3",
      "cycle-0",
      "cycle-1",
      "cycle-2",
    ]);

    const next = moveHeatmapCycleOrder(
      ["cycle-0", "cycle-1", "cycle-2", "cycle-3"],
      "cycle-3",
      "cycle-1",
    );
    expect(next).toEqual(["cycle-0", "cycle-3", "cycle-1", "cycle-2"]);

    saveHeatmapCycleOrder(next);
    expect(loadHeatmapCycleOrder()).toEqual(next);
  });
});
