import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import { LocaleProvider, useLocale } from "./i18n";

function LocaleProbe() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div>
      <p data-testid="label">{t("nav.dashboard")}</p>
      <p data-testid="locale">{locale}</p>
      <button onClick={() => setLocale("en")}>set-en</button>
      <button onClick={() => setLocale("zh-CN")}>set-zh</button>
    </div>
  );
}

describe("LocaleProvider", () => {
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
  });

  test("uses stored locale and keeps manual switch", () => {
    window.localStorage.setItem("token-insight.locale", "zh-CN");
    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("zh-CN");
    expect(screen.getByTestId("label")).toHaveTextContent("看板");

    fireEvent.click(screen.getByText("set-en"));
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByTestId("label")).toHaveTextContent("Dashboard");
    expect(window.localStorage.getItem("token-insight.locale")).toBe("en");
  });
});
