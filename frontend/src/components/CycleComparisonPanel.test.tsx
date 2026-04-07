import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import CycleComparisonPanel from "./CycleComparisonPanel";

let lastOption: unknown = null;

vi.mock("../lib/echarts", async () => {
  return {
    ReactECharts: ({ option }: { option: unknown }) => {
      lastOption = option;
      return <div data-testid="cycle-comparison-chart" />;
    },
    echarts: {},
  };
});

vi.mock("../lib/i18n", () => ({
  useLocale: () => ({
    locale: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("../lib/theme", () => ({
  useTheme: () => ({
    theme: "signal",
    layoutTheme: "console",
  }),
  chartPalette: () => ({
    axis: "#8ea8ff",
    axisAccent: "#ffb26b",
    splitLine: "rgba(95, 130, 255, 0.26)",
    tokenLine: "#22d3ee",
    tokenArea: "rgba(34, 211, 238, 0.2)",
    costLine: "#fb7185",
    costArea: "rgba(251, 113, 133, 0.18)",
    pieLabel: "#d5e7ff",
  }),
}));

describe("CycleComparisonPanel", () => {
  beforeEach(() => {
    lastOption = null;
  });

  test("switches between token and cost metrics across totals and rhythm views", async () => {
    render(
      <CycleComparisonPanel
        cells={[
          { day: "2026-04-02", week_index: 0, weekday: 4, total_tokens: 120, total_cost_usd: 1.2, intensity: 0.4 },
          { day: "2026-04-04", week_index: 0, weekday: 6, total_tokens: 30, total_cost_usd: 0.3, intensity: 0.2 },
          { day: "2026-04-06", week_index: 0, weekday: 1, total_tokens: 80, total_cost_usd: 0.8, intensity: 0.3 },
          { day: "2026-04-07", week_index: 0, weekday: 2, total_tokens: 90, total_cost_usd: 0.9, intensity: 0.2 },
          { day: "2026-03-26", week_index: 1, weekday: 3, total_tokens: 90, total_cost_usd: 0.9, intensity: 0.3 },
          { day: "2026-03-28", week_index: 1, weekday: 5, total_tokens: 60, total_cost_usd: 0.6, intensity: 0.2 },
          { day: "2026-03-20", week_index: 2, weekday: 5, total_tokens: 50, total_cost_usd: 0.5, intensity: 0.2 },
          { day: "2026-03-13", week_index: 3, weekday: 4, total_tokens: 70, total_cost_usd: 0.7, intensity: 0.2 },
        ]}
        settings={{ resetDate: "2026-04-08", cycleDays: 7 }}
      />,
    );

    const metricGroup = screen.getByRole("group", { name: "cycleCompare.aria.metric" });
    const modeGroup = screen.getByRole("group", { name: "cycleCompare.aria.mode" });
    expect(metricGroup.closest(".cycle-compare-toolbar")).toBe(modeGroup.closest(".cycle-compare-toolbar"));
    expect(screen.queryByRole("group", { name: "cycleCompare.aria.rhythmMode" })).toBeNull();

    expect(screen.getByRole("button", { name: "cycleCompare.metric.tokens" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "cycleCompare.mode.total" })).toHaveClass("active");
    expect(screen.getByTestId("cycle-comparison-chart")).toBeInTheDocument();

    await waitFor(() => {
      expect(lastOption).not.toBeNull();
      const totalsSeries = (lastOption as {
        series?: Array<{ type?: string; data?: Array<{ itemStyle?: { color?: string } }> }>;
      }).series?.[0];
      const colors = totalsSeries?.data?.map((point) => point.itemStyle?.color) ?? [];
      expect(totalsSeries?.type).toBe("bar");
      expect(colors).toHaveLength(4);
      expect(colors.every((color) => typeof color === "string" && color.startsWith("#"))).toBe(true);
      expect(new Set(colors).size).toBe(4);
    });

    fireEvent.click(screen.getByRole("button", { name: "cycleCompare.metric.cost" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "cycleCompare.metric.cost" })).toHaveClass("active");
      const totalsSeries = (lastOption as {
        yAxis?: { axisLabel?: { formatter?: (value: number) => string } };
        series?: Array<{ type?: string; data?: Array<{ value?: number; itemStyle?: { color?: string } }> }>;
      }).series?.[0];
      const values = totalsSeries?.data?.map((point) => point.value ?? 0) ?? [];
      expect(values).toHaveLength(4);
      expect(values[0]).toBeCloseTo(0.7, 5);
      expect(values[1]).toBeCloseTo(0.5, 5);
      expect(values[2]).toBeCloseTo(1.5, 5);
      expect(values[3]).toBeCloseTo(3.2, 5);
      const formatter = (lastOption as {
        yAxis?: { axisLabel?: { formatter?: (value: number) => string } };
      }).yAxis?.axisLabel?.formatter;
      expect(formatter?.(1234)).toContain("$");
    });

    fireEvent.click(screen.getByRole("button", { name: "cycleCompare.mode.rhythm" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "cycleCompare.mode.rhythm" })).toHaveClass("active");
      expect(screen.getByRole("button", { name: "cycleCompare.mode.distribution" })).toHaveClass("active");
      const rhythmGroup = screen.getByRole("group", { name: "cycleCompare.aria.rhythmMode" });
      expect(rhythmGroup.closest(".cycle-compare-toolbar")).toBe(metricGroup.closest(".cycle-compare-toolbar"));
      const distributionSeries = (lastOption as {
        series?: Array<{ type?: string; itemStyle?: { color?: string }; data?: Array<number | null> }>;
      }).series ?? [];
      const colors = distributionSeries.map((entry) => entry.itemStyle?.color);
      expect(distributionSeries[0]?.type).toBe("bar");
      expect(distributionSeries[0]?.data?.[6]).toBeNull();
      expect(colors).toHaveLength(4);
      expect(colors.every((color) => typeof color === "string" && color.startsWith("#"))).toBe(true);
      expect(new Set(colors).size).toBe(4);
      expect(distributionSeries[0]?.data?.[0]).toBeCloseTo(1.2, 5);
    });

    fireEvent.click(screen.getByRole("button", { name: "cycleCompare.mode.cumulative" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "cycleCompare.mode.cumulative" })).toHaveClass("active");
      expect((lastOption as { series?: Array<{ type?: string }> }).series?.[0]?.type).toBe("line");
    });

    fireEvent.click(screen.getByRole("button", { name: "cycleCompare.mode.total" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "cycleCompare.mode.total" })).toHaveClass("active");
      expect((lastOption as { series?: Array<{ type?: string }> }).series?.[0]?.type).toBe("bar");
    });

    fireEvent.click(screen.getByRole("button", { name: "cycleCompare.metric.tokens" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "cycleCompare.metric.tokens" })).toHaveClass("active");
      const totalsSeries = (lastOption as {
        series?: Array<{ type?: string; data?: Array<{ value?: number }> }>;
      }).series?.[0];
      const values = totalsSeries?.data?.map((point) => point.value ?? 0) ?? [];
      expect(values).toEqual([70, 50, 150, 320]);
    });
  });
});
