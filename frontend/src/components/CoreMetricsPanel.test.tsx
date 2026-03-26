import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import CoreMetricsPanel from "./CoreMetricsPanel";
import { LocaleProvider } from "../lib/i18n";

describe("CoreMetricsPanel", () => {
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

  test("moves cost unit into the title and lets the user switch units", () => {
    render(
      <LocaleProvider>
        <CoreMetricsPanel
          stats={{
            total_tokens: 120000,
            total_cost_usd: 1234.56,
            prompt_tokens: 50000,
            completion_tokens: 40000,
            cache_read_tokens: 10000,
            cache_write_tokens: 5000,
            reasoning_tokens: 10000,
            tool_tokens: 5000,
            event_count: 42,
            active_days: 6,
            streak_days: 3,
            top_model: "gpt-5",
            top_source: "cli",
            last_event_at: "2026-03-25T08:00:00Z",
            last_refresh_at: "2026-03-25T08:05:00Z",
          }}
        />
      </LocaleProvider>,
    );

    const costCard = screen.getByText("Estimated Cost (K USD)").closest("article");
    expect(costCard).toBeTruthy();
    expect(within(costCard!).getByText("1.2")).toBeInTheDocument();

    fireEvent.click(within(costCard!).getByRole("button", { name: "¢" }));
    expect(within(costCard!).getByText("Estimated Cost (¢)")).toBeInTheDocument();

    fireEvent.click(within(costCard!).getByRole("button", { name: "USD" }));
    expect(within(costCard!).getByText("Estimated Cost (USD)")).toBeInTheDocument();
  });
});
