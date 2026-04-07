import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import FilterBar from "./FilterBar";
import { LocaleProvider } from "../lib/i18n";
import type { UsageFilter } from "../lib/api";
import type { HeatmapCycleSettings } from "../lib/heatmapCycles";

const baseFilter: UsageFilter = {
  sources: [],
  providers: [],
  models: [],
  modelFamilies: [],
  projects: [],
  preset: "recent30d",
  timezone: "UTC",
  sort: "tokens:desc",
  excludeArchived: false,
};

const baseCycleSettings: HeatmapCycleSettings = {
  resetDate: "2026-03-31",
  cycleDays: 7,
};

function renderFilterBar(
  filter: UsageFilter = baseFilter,
  cycleSettings: HeatmapCycleSettings = baseCycleSettings,
  onCycleSettingsChange: (next: HeatmapCycleSettings) => void = () => undefined,
) {
  return render(
    <LocaleProvider>
      <FilterBar
        filter={filter}
        tokenModelOptions={[
          { value: "gpt-5", label: "gpt-5", tokens: 1200 },
          { value: "o3-mini", label: "o3-mini", tokens: 800 },
        ]}
        cycleSettings={cycleSettings}
        pinned={false}
        showInlineTools={false}
        activeFilterCount={0}
        onTogglePinned={() => undefined}
        onScrollTop={() => undefined}
        onRefresh={() => undefined}
        onOpenAdvanced={() => undefined}
        onChange={() => undefined}
        onCycleSettingsChange={onCycleSettingsChange}
        onClear={() => undefined}
        onResetLayout={() => undefined}
        layoutCustomized={false}
      />
    </LocaleProvider>,
  );
}

describe("FilterBar", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    const store = new Map<string, string>([["token-insight.locale", "en"]]);
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
  });

  test("does not render default scope chip when there are no active filters", () => {
    renderFilterBar();

    expect(screen.queryByText("Current: default scope")).not.toBeInTheDocument();
  });

  test("shows the recent 30 day preset and hides the legacy month preset", () => {
    renderFilterBar();

    expect(screen.getByRole("button", { name: "Recent 30D" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "This Month" })).not.toBeInTheDocument();
  });

  test("renders model summary chip and overlay in a portal", () => {
    renderFilterBar({ ...baseFilter, models: ["gpt-5"] });

    expect(screen.getAllByText("gpt-5").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "gpt-5" }));
    expect(document.body.querySelector(".model-spend-overlay")).toBeTruthy();
    expect(screen.getByText("o3-mini")).toBeInTheDocument();
  });

  test("renders cycle settings controls and forwards updates", () => {
    const onCycleSettingsChange = vi.fn();
    renderFilterBar(baseFilter, baseCycleSettings, onCycleSettingsChange);

    expect(screen.getByRole("group", { name: "Cycle settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Next reset date")).toHaveValue("2026-03-31");
    expect(screen.getByLabelText("Cycle days")).toHaveValue(7);

    fireEvent.change(screen.getByLabelText("Next reset date"), {
      target: { value: "2026-04-07" },
    });
    expect(onCycleSettingsChange).toHaveBeenCalledWith({
      resetDate: "2026-04-07",
      cycleDays: 7,
    });

    fireEvent.change(screen.getByLabelText("Cycle days"), {
      target: { value: "14" },
    });
    expect(onCycleSettingsChange).toHaveBeenCalledWith({
      resetDate: "2026-03-31",
      cycleDays: 14,
    });
  });
});
