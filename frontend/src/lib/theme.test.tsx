import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import { ThemeProvider, useTheme } from "./theme";

function ThemeProbe() {
  const { theme, setTheme, layoutTheme, setLayoutTheme } = useTheme();
  return (
    <div>
      <p data-testid="theme">{theme}</p>
      <p data-testid="layout">{layoutTheme}</p>
      <button onClick={() => setTheme("signal")}>set-signal</button>
      <button onClick={() => setLayoutTheme("radar")}>set-radar</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
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
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-layout");
  });

  test("uses saved theme and syncs html dataset", () => {
    window.localStorage.setItem("token-insight.theme", "midnight");
    window.localStorage.setItem("token-insight.layout", "dock");
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("midnight");
    expect(screen.getByTestId("layout")).toHaveTextContent("dock");
    expect(document.documentElement.dataset.theme).toBe("midnight");
    expect(document.documentElement.dataset.layout).toBe("dock");
  });

  test("updates storage and dataset when theme changes", () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText("set-signal"));
    fireEvent.click(screen.getByText("set-radar"));
    expect(screen.getByTestId("theme")).toHaveTextContent("signal");
    expect(screen.getByTestId("layout")).toHaveTextContent("radar");
    expect(window.localStorage.getItem("token-insight.theme")).toBe("signal");
    expect(window.localStorage.getItem("token-insight.layout")).toBe("radar");
    expect(document.documentElement.dataset.theme).toBe("signal");
    expect(document.documentElement.dataset.layout).toBe("radar");
  });
});
