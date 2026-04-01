import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import FilterBar from "./FilterBar";
import { LocaleProvider } from "../lib/i18n";
import type { UsageFilter } from "../lib/api";

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

function renderFilterBar(filter: UsageFilter = baseFilter) {
  return render(
    <LocaleProvider>
      <FilterBar
        filter={filter}
        tokenModelOptions={[
          { value: "gpt-5", label: "gpt-5", tokens: 1200 },
          { value: "o3-mini", label: "o3-mini", tokens: 800 },
        ]}
        pinned={false}
        showInlineTools={false}
        activeFilterCount={0}
        onTogglePinned={() => undefined}
        onScrollTop={() => undefined}
        onRefresh={() => undefined}
        onOpenAdvanced={() => undefined}
        onChange={() => undefined}
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
});
