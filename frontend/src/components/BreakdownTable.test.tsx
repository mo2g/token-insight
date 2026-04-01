import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import BreakdownTable from "./BreakdownTable";
import type { BreakdownRow } from "../lib/api";
import { LocaleProvider } from "../lib/i18n";

const baseRow: BreakdownRow = {
  key: "gpt-5",
  label: "gpt-5",
  event_count: 4,
  total_tokens: 1000,
  total_cost_usd: 0.000123456,
  prompt_tokens: 600,
  completion_tokens: 300,
  cache_read_tokens: 50,
  cache_write_tokens: 20,
  reasoning_tokens: 30,
};

function renderRankingTable(rows: BreakdownRow[]) {
  return render(
    <LocaleProvider>
      <BreakdownTable rows={rows} mode="ranking" />
    </LocaleProvider>,
  );
}

describe("BreakdownTable", () => {
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

  test("shows a cost header with units and a precise 1M token tooltip", () => {
    renderRankingTable([baseRow]);

    expect(screen.getByText("Cost (USD)")).toBeInTheDocument();
    expect(screen.getByText("0.00")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1M" })).toBeInTheDocument();
    expect(screen.getByText("Avg per 1M tokens: $0.123456")).toBeInTheDocument();
  });

  test("falls back to n/a when a row has no tokens", () => {
    renderRankingTable([
      {
        ...baseRow,
        total_tokens: 0,
        total_cost_usd: 0.015,
      },
    ]);

    expect(screen.getByText("Avg per 1M tokens: n/a")).toBeInTheDocument();
  });
});
