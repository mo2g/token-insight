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
const APP_MAX_WIDTH = 1440;
const APP_HORIZONTAL_PADDING = 16;
const GUTTER_DOCK_MIN = 96;

type DockPlacement = "gutter" | "inline" | "corner";

export default function App() {
  const { locale, setLocale, t } = useLocale();
  const { theme, setTheme, layoutTheme, setLayoutTheme } = useTheme();
  const location = useLocation();
  const mastheadRef = useRef<HTMLElement | null>(null);
  const [mastheadVisible, setMastheadVisible] = useState(true);
  const [filterPinned, setFilterPinned] = useState(() => loadInitialFilterPinned());
  const [dockPlacement, setDockPlacement] = useState<DockPlacement>(() => resolveDockPlacement());
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
    const update = () => setDockPlacement(resolveDockPlacement());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div className="app-shell">
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
          visible={dockVisible && dockPlacement !== "inline"}
          placement={dockPlacement === "corner" ? "corner" : "gutter"}
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
                inlineDockTools={dockVisible && dockPlacement === "inline"}
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

function resolveDockPlacement(): DockPlacement {
  if (typeof window === "undefined") return "gutter";
  if (window.innerWidth <= 1024) return "corner";

  const shellWidth = Math.min(
    APP_MAX_WIDTH,
    Math.max(0, window.innerWidth - APP_HORIZONTAL_PADDING * 2),
  );
  const sideGutter = Math.max(0, (window.innerWidth - shellWidth) / 2);
  return sideGutter >= GUTTER_DOCK_MIN ? "gutter" : "inline";
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
