import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SourceHealthPanel from "./SourceHealthPanel";
import { LocaleProvider } from "../lib/i18n";

describe("SourceHealthPanel", () => {
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

    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect() {
        const height = this.classList.contains("health-groups") ? 240 : 0;
        return {
          width: 320,
          height,
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: height,
          right: 320,
          toJSON: () => ({}),
        };
      },
    });

    class ResizeObserverMock {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element) {
        this.callback(
          [{
            target,
            contentRect: {
              width: 320,
              height: 240,
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              bottom: 240,
              right: 320,
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

  test("defaults to expanded details and renders a non-scrolling details stack", async () => {
    const onContentHeightChange = vi.fn();
    const items = [
      {
        source: "cursor",
        label: "Cursor",
        mode: "watch",
        imported_events: 12,
        discovered_artifacts: 3,
        last_scan_completed_at: "2026-03-26T12:00:00Z",
        last_duration_ms: 1250,
        watched_paths: ["/tmp/project"],
      },
    ];
    const { container } = render(
      <LocaleProvider>
        <SourceHealthPanel
          items={items}
          variant="summary"
          onContentHeightChange={onContentHeightChange}
        />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(onContentHeightChange).toHaveBeenCalledWith(240);
    });

    expect(screen.getByRole("button", { name: "Hide details" })).toBeInTheDocument();
    expect(container.querySelector(".health-details-scroll")).toBeNull();
    expect(container.querySelector(".health-details-stack")).not.toBeNull();
  });
});
