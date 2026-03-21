import { NavLink, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import SocialImagePage from "./pages/SocialImagePage";
import { useLocale } from "./lib/i18n";

export default function App() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">{t("app.eyebrow")}</p>
          <h1>Token Insight</h1>
          <p className="subtitle">{t("app.subtitle")}</p>
        </div>
        <div className="nav-stack">
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
              onClick={() => setLocale("en")}
            >
              {t("nav.language.en")}
            </button>
            <button
              className={locale === "zh-CN" ? "locale-button active" : "locale-button"}
              onClick={() => setLocale("zh-CN")}
            >
              {t("nav.language.zh")}
            </button>
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/social" element={<SocialImagePage />} />
        </Routes>
      </main>
    </div>
  );
}

function navClass(isActive: boolean) {
  return isActive ? "nav-link active" : "nav-link";
}
