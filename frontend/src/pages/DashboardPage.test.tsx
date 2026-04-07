import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { LayoutItem } from "react-grid-layout";
import DashboardPage from "./DashboardPage";

let latestGridLayout: LayoutItem[] = [];

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = queryKey[0];
    switch (key) {
      case "overview":
        return { data: { total_tokens: 1234, total_cost_usd: 12.5, event_count: 3, active_days: 2 } };
      case "timeline":
        return { data: [] };
      default:
        return { data: [] };
    }
  },
}));

vi.mock("react-grid-layout", () => ({
  default: ({ layout, children }: { layout: LayoutItem[]; children: React.ReactNode }) => {
    latestGridLayout = layout;
    return <div data-testid="grid-layout">{children}</div>;
  },
}));

vi.mock("../components/BreakdownTable", () => ({
  default: () => <div data-testid="breakdown-table">table</div>,
}));

vi.mock("../components/ContributionHeatmap", async () => {
  const React = await import("react");

  return {
    default: ({
      settings,
      onContentHeightChange,
    }: {
      settings: { resetDate: string; cycleDays: number };
      onContentHeightChange?: (heightPx: number) => void;
    }) => {
      const [singleColumn, setSingleColumn] = React.useState(false);

      React.useEffect(() => {
        onContentHeightChange?.(singleColumn ? 720 : 420);
      }, [singleColumn, onContentHeightChange]);

      return (
        <div>
          <div data-testid="heatmap-settings">
            {settings.resetDate}|{settings.cycleDays}
          </div>
          <button type="button" onClick={() => setSingleColumn((value) => !value)}>
            {singleColumn ? "collapse heatmap" : "single column heatmap"}
          </button>
        </div>
      );
    },
  };
});

vi.mock("../components/CycleComparisonPanel", () => ({
  default: ({
    settings,
  }: {
    settings: { resetDate: string; cycleDays: number };
  }) => (
    <div data-testid="cycle-comparison-settings">
      {settings.resetDate}|{settings.cycleDays}
    </div>
  ),
}));

vi.mock("../components/CoreMetricsPanel", () => ({
  default: () => <div data-testid="core-metrics">metrics</div>,
}));

vi.mock("../components/FilterBar", () => ({
  default: ({
    cycleSettings,
    onCycleSettingsChange,
  }: {
    cycleSettings: { resetDate: string; cycleDays: number };
    onCycleSettingsChange: (next: { resetDate: string; cycleDays: number }) => void;
  }) => (
    <div data-testid="filter-bar">
      <div data-testid="filter-cycle-settings">
        {cycleSettings.resetDate}|{cycleSettings.cycleDays}
      </div>
      <button
        type="button"
        onClick={() => onCycleSettingsChange({ resetDate: "2026-04-01", cycleDays: 14 })}
      >
        set-cycle-settings
      </button>
    </div>
  ),
}));

vi.mock("../components/FilterDrawer", () => ({
  default: () => null,
}));

vi.mock("../components/SourceHealthPanel", async () => {
  const React = await import("react");

  return {
    default: ({
      onContentHeightChange,
    }: {
      onContentHeightChange?: (heightPx: number) => void;
    }) => {
      const [expanded, setExpanded] = React.useState(false);

      React.useEffect(() => {
        onContentHeightChange?.(expanded ? 620 : 120);
      }, [expanded, onContentHeightChange]);

      return (
        <button type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "collapse health" : "expand health"}
        </button>
      );
    },
  };
});

vi.mock("../lib/echarts", () => ({
  ReactECharts: () => <div data-testid="echarts" />,
  echarts: {},
}));

vi.mock("../lib/i18n", () => ({
  useLocale: () => ({
    locale: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("../lib/theme", () => ({
  useTheme: () => ({
    theme: "console",
    layoutTheme: "console",
  }),
  chartPalette: () => ({
    axis: "#888",
    axisAccent: "#999",
    splitLine: "#222",
    tokenLine: "#0ff",
    tokenArea: "#0ff22",
    costLine: "#fa0",
    costArea: "#fa022",
    pieLabel: "#fff",
  }),
}));

vi.mock("../lib/useRefreshStream", () => ({
  useRefreshStream: () => undefined,
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    latestGridLayout = [];

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
        clear: () => {
          store.clear();
        },
      },
    });

    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        if (this.classList.contains("dashboard-filter-shell")) return 64;
        if (this.classList.contains("panel")) return 220;
        return 0;
      },
    });

    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        if (this.classList.contains("dashboard-grid-wrap")) return 1320;
        if (this.classList.contains("panel-body")) return 120;
        return 0;
      },
    });

    class ResizeObserverMock {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element) {
        const element = target as HTMLElement;
        let width = 960;
        let height = 64;

        if (element.classList.contains("dashboard-grid-wrap")) {
          width = 1320;
          height = 800;
        } else if (element.classList.contains("health-groups")) {
          width = 420;
          height = 620;
        } else if (element.classList.contains("panel")) {
          width = 420;
          height = 220;
        } else if (element.classList.contains("panel-body")) {
          width = 420;
          height = 120;
        }

        this.callback(
          [{
            target,
            contentRect: {
              width,
              height,
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              bottom: height,
              right: width,
              toJSON: () => ({}),
            } as DOMRectReadOnly,
          } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }

      unobserve() {}

      disconnect() {}
    }

    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });
  });

  test("expands heatmap and source health cards with runtime content height", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <DashboardPage
          filterPinned={false}
          mastheadCollapsed={false}
          inlineDockTools={false}
          onToggleFilterPinned={() => undefined}
          onScrollTop={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "trend.exportJson" })).toHaveAttribute(
      "download",
      "token-insight-events.json",
    );
    expect(screen.getByRole("link", { name: "trend.exportCsv" })).toHaveAttribute(
      "download",
      "token-insight-events.csv",
    );

    await waitFor(() => {
      const heatmap = latestGridLayout.find((item) => item.i === "heatmap");
      const health = latestGridLayout.find((item) => item.i === "health");
      expect(heatmap?.h).toBe(12);
      expect(health?.h).toBe(10);
    });

    fireEvent.click(screen.getByRole("button", { name: "set-cycle-settings" }));

    await waitFor(() => {
      expect(screen.getByTestId("filter-cycle-settings")).toHaveTextContent("2026-04-01|14");
      expect(screen.getByTestId("heatmap-settings")).toHaveTextContent("2026-04-01|14");
      expect(screen.getByTestId("cycle-comparison-settings")).toHaveTextContent("2026-04-01|14");
    });

    fireEvent.click(screen.getByRole("button", { name: "single column heatmap" }));

    await waitFor(() => {
      const heatmap = latestGridLayout.find((item) => item.i === "heatmap");
      expect(heatmap?.h).toBe(18);
    });

    fireEvent.click(screen.getByRole("button", { name: "expand health" }));

    await waitFor(() => {
      const health = latestGridLayout.find((item) => item.i === "health");
      expect(health?.h).toBe(16);
    });

    fireEvent.click(screen.getByRole("button", { name: "collapse heatmap" }));
    fireEvent.click(screen.getByRole("button", { name: "collapse health" }));

    await waitFor(() => {
      const heatmap = latestGridLayout.find((item) => item.i === "heatmap");
      const health = latestGridLayout.find((item) => item.i === "health");
      expect(heatmap?.h).toBe(12);
      expect(health?.h).toBe(10);
    });
  });
});
