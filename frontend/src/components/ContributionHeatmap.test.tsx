import { render } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import ContributionHeatmap from "./ContributionHeatmap";
import { LocaleProvider } from "../lib/i18n";

describe("ContributionHeatmap", () => {
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

  test("uses auto cycle layout by default", () => {
    const { container } = render(
      <LocaleProvider>
        <ContributionHeatmap
          cells={[]}
          settings={{ resetDate: "2026-03-31", cycleDays: 7 }}
          onSettingsChange={() => {}}
        />
      </LocaleProvider>,
    );

    const panel = container.querySelector(".heatmap-panel");
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains("single-column")).toBe(false);
  });

  test("supports explicit single-column mode", () => {
    const { container } = render(
      <LocaleProvider>
        <ContributionHeatmap
          cells={[]}
          cycleLayout="single-column"
          settings={{ resetDate: "2026-03-31", cycleDays: 7 }}
          onSettingsChange={() => {}}
        />
      </LocaleProvider>,
    );

    const panel = container.querySelector(".heatmap-panel");
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains("single-column")).toBe(true);
    expect(panel?.getAttribute("style")).toContain("--heatmap-cycle-card-width: 248px");
    expect(panel?.getAttribute("style")).toContain("--heatmap-cycle-card-size: min(100%, 248px)");
  });

  test("keeps auto layout independent from resize observers", () => {
    const { container } = render(
      <LocaleProvider>
        <ContributionHeatmap
          cells={[]}
          settings={{ resetDate: "2026-03-31", cycleDays: 7 }}
          onSettingsChange={() => {}}
        />
      </LocaleProvider>,
    );

    const panel = container.querySelector(".heatmap-panel");
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains("single-column")).toBe(false);
  });
});
