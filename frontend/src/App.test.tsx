import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { LocaleProvider } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";

vi.mock("./pages/DashboardPage", () => ({
  default: (props: {
    filterPinned: boolean;
    mastheadCollapsed: boolean;
    inlineDockTools: boolean;
    onScrollTop: () => void;
  }) => (
    <div>
      <p data-testid="dashboard-page">dashboard</p>
      <p data-testid="dashboard-pinned">{String(props.filterPinned)}</p>
      <p data-testid="dashboard-collapsed">{String(props.mastheadCollapsed)}</p>
      <p data-testid="dashboard-inline-tools">{String(props.inlineDockTools)}</p>
    </div>
  ),
}));

vi.mock("./pages/SocialImagePage", () => ({
  default: () => <div data-testid="social-page">social</div>,
}));

describe("App", () => {
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
        clear: () => {
          store.clear();
        },
      },
    });

    let callback: IntersectionObserverCallback = () => undefined;
    class MockIntersectionObserver {
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }

    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: MockIntersectionObserver,
    });
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: MockIntersectionObserver,
    });
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });

    Object.defineProperty(window, "__triggerMastheadObserver", {
      configurable: true,
      value: (isIntersecting: boolean) => {
        callback(
          [
            {
              isIntersecting,
              target: document.body,
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRatio: isIntersecting ? 1 : 0,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: 0,
            },
          ],
          {} as IntersectionObserver,
        );
      },
    });
  });

  test("shows mascot dock after masthead collapses and toggles pinned state", () => {
    render(
      <ThemeProvider>
        <LocaleProvider>
          <MemoryRouter initialEntries={["/"]}>
            <App />
          </MemoryRouter>
        </LocaleProvider>
      </ThemeProvider>,
    );

    expect(document.querySelector(".mascot-dock")?.classList.contains("visible")).toBe(false);

    act(() => {
      (
        window as unknown as Window & {
          __triggerMastheadObserver: (value: boolean) => void;
        }
      ).__triggerMastheadObserver(false);
    });

    expect(document.querySelector(".mascot-dock")?.classList.contains("visible")).toBe(true);
    fireEvent.click(screen.getByText("Floating").closest("button")!);
    expect(screen.getByTestId("dashboard-pinned")).toHaveTextContent("true");
  });
});
