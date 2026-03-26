import { useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import SocialImagePage from "./pages/SocialImagePage";
import MascotDock from "./components/MascotDock";
import { useLocale } from "./lib/i18n";
import {
  LAYOUT_THEMES,
  THEMES,
  type LayoutThemeId,
  type ThemeId,
  useTheme,
} from "./lib/theme";

const FILTER_PIN_STORAGE_KEY = "token-insight.filter-pinned.v1";
const GUTTER_DOCK_MIN = 90;
const GUTTER_DOCK_WIDTH = 78;
const GUTTER_DOCK_GAP = 12;

type DockPlacement = "gutter" | "inline" | "corner";
type DockState = {
  placement: DockPlacement;
  gutterLeft?: number;
};

export default function App() {
  const { locale, setLocale, t } = useLocale();
  const { theme, setTheme, layoutTheme, setLayoutTheme } = useTheme();
  const location = useLocation();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const mastheadRef = useRef<HTMLElement | null>(null);
  const [mastheadVisible, setMastheadVisible] = useState(true);
  const [filterPinned, setFilterPinned] = useState(() => loadInitialFilterPinned());
  const [dockState, setDockState] = useState<DockState>(() => resolveDockState(null));
  const isDashboard = location.pathname === "/";
  const dockVisible = isDashboard && !mastheadVisible;

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FILTER_PIN_STORAGE_KEY, String(filterPinned));
    }
  }, [filterPinned]);

  useEffect(() => {
    const element = mastheadRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const next = entries.at(0);
        if (!next) return;
        setMastheadVisible(next.isIntersecting);
      },
      { threshold: 0.18 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setDockState(resolveDockState(shellRef.current));
    update();
    const shell = shellRef.current;
    const observer =
      !shell || typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => update());
    if (observer && shell) {
      observer.observe(shell);
    }
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div ref={shellRef} className="app-shell">
      <header ref={mastheadRef} className="masthead">
        <div className="masthead-brand">
          <h1>Token Insight</h1>
          <p className="subtitle">{t("app.subtitle")}</p>
        </div>
        <div className="masthead-controls">
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => navClass(isActive)}>
              {t("nav.dashboard")}
            </NavLink>
            <NavLink to="/social" className={({ isActive }) => navClass(isActive)}>
              {t("nav.social")}
            </NavLink>
          </nav>
          <div className="locale-switch" role="group" aria-label={t("nav.languageSwitchAria")}>
            <button
              className={locale === "en" ? "locale-button active" : "locale-button"}
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              {t("nav.language.en")}
            </button>
            <button
              className={locale === "zh-CN" ? "locale-button active" : "locale-button"}
              aria-pressed={locale === "zh-CN"}
              onClick={() => setLocale("zh-CN")}
            >
              {t("nav.language.zh")}
            </button>
          </div>
          <div className="switch-block">
            <span className="switch-label">{t("nav.layoutGroup")}</span>
            <div className="theme-switch" role="group" aria-label={t("nav.themeSwitchAria")}>
              {LAYOUT_THEMES.map((item) => (
                <button
                  key={item}
                  className={layoutTheme === item ? "theme-button active" : "theme-button"}
                  aria-pressed={layoutTheme === item}
                  onClick={() => setLayoutTheme(item)}
                  title={layoutLabel(t, item)}
                >
                  {layoutLabelShort(t, item)}
                </button>
              ))}
            </div>
          </div>
          <div className="switch-block">
            <span className="switch-label">{t("nav.skinGroup")}</span>
            <div className="theme-switch" role="group" aria-label={t("nav.skinSwitchAria")}>
              {THEMES.map((item) => (
                <button
                  key={item}
                  className={theme === item ? "theme-button active" : "theme-button"}
                  aria-pressed={theme === item}
                  onClick={() => setTheme(item)}
                  title={themeLabel(t, item)}
                >
                  {themeLabelShort(t, item)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {isDashboard ? (
        <MascotDock
          visible={dockVisible && dockState.placement !== "inline"}
          placement={dockState.placement === "corner" ? "corner" : "gutter"}
          gutterLeft={dockState.gutterLeft}
          filterPinned={filterPinned}
          onTogglePinned={() => setFilterPinned((value) => !value)}
          onScrollTop={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        />
      ) : null}

      <main>
        <Routes>
          <Route
            path="/"
            element={
              <DashboardPage
                filterPinned={filterPinned}
                mastheadCollapsed={!mastheadVisible}
                inlineDockTools={dockVisible && dockState.placement === "inline"}
                onToggleFilterPinned={() => setFilterPinned((value) => !value)}
                onScrollTop={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              />
            }
          />
          <Route path="/social" element={<SocialImagePage />} />
        </Routes>
      </main>
    </div>
  );
}

function loadInitialFilterPinned() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FILTER_PIN_STORAGE_KEY) === "true";
}

function resolveDockState(shell: HTMLElement | null): DockState {
  if (typeof window === "undefined") return { placement: "gutter", gutterLeft: 0 };
  if (window.innerWidth <= 1024) return { placement: "corner" };

  const shellRect = shell?.getBoundingClientRect();
  if (!shellRect || shellRect.width <= 0) {
    return { placement: "inline" };
  }

  const rightGutter = Math.max(0, window.innerWidth - shellRect.right);
  if (rightGutter < GUTTER_DOCK_MIN || rightGutter < GUTTER_DOCK_WIDTH + GUTTER_DOCK_GAP) {
    return { placement: "inline" };
  }

  return {
    placement: "gutter",
    gutterLeft: shellRect.right + GUTTER_DOCK_GAP,
  };
}

function navClass(isActive: boolean) {
  return isActive ? "nav-link active" : "nav-link";
}

function themeLabel(
  t: ReturnType<typeof useLocale>["t"],
  theme: ThemeId,
) {
  switch (theme) {
    case "sand":
      return t("nav.theme.sand");
    case "midnight":
      return t("nav.theme.midnight");
    case "frost":
      return t("nav.theme.frost");
    case "signal":
      return t("nav.theme.signal");
  }
}

function themeLabelShort(
  t: ReturnType<typeof useLocale>["t"],
  theme: ThemeId,
) {
  switch (theme) {
    case "sand":
      return t("nav.themeShort.sand");
    case "midnight":
      return t("nav.themeShort.midnight");
    case "frost":
      return t("nav.themeShort.frost");
    case "signal":
      return t("nav.themeShort.signal");
  }
}

function layoutLabel(
  t: ReturnType<typeof useLocale>["t"],
  layout: LayoutThemeId,
) {
  switch (layout) {
    case "console":
      return t("nav.layout.console");
    case "dock":
      return t("nav.layout.dock");
    case "radar":
      return t("nav.layout.radar");
  }
}

function layoutLabelShort(
  t: ReturnType<typeof useLocale>["t"],
  layout: LayoutThemeId,
) {
  switch (layout) {
    case "console":
      return t("nav.layoutShort.console");
    case "dock":
      return t("nav.layoutShort.dock");
    case "radar":
      return t("nav.layoutShort.radar");
  }
}
