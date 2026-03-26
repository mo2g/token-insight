import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "token-insight.theme";
const LAYOUT_STORAGE_KEY = "token-insight.layout";

export const THEMES = ["sand", "midnight", "frost", "signal"] as const;
export type ThemeId = (typeof THEMES)[number];
export const LAYOUT_THEMES = ["console", "dock", "radar"] as const;
export type LayoutThemeId = (typeof LAYOUT_THEMES)[number];

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  layoutTheme: LayoutThemeId;
  setLayoutTheme: (theme: LayoutThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeId>(() => detectInitialTheme());
  const [layoutTheme, setLayoutTheme] = useState<LayoutThemeId>(() =>
    detectInitialLayoutTheme(),
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, theme);
    }
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, layoutTheme);
    }
    if (typeof document !== "undefined") {
      document.documentElement.dataset.layout = layoutTheme;
    }
  }, [layoutTheme]);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, layoutTheme, setLayoutTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

export type ChartPalette = {
  axis: string;
  axisAccent: string;
  splitLine: string;
  tokenLine: string;
  tokenArea: string;
  costLine: string;
  costArea: string;
  pieLabel: string;
};

export function chartPalette(theme: ThemeId): ChartPalette {
  switch (theme) {
    case "midnight":
      return {
        axis: "#8aa3b7",
        axisAccent: "#f0b184",
        splitLine: "rgba(112, 145, 170, 0.2)",
        tokenLine: "#34d399",
        tokenArea: "rgba(52, 211, 153, 0.16)",
        costLine: "#fb923c",
        costArea: "rgba(251, 146, 60, 0.14)",
        pieLabel: "#d6e6f2",
      };
    case "frost":
      return {
        axis: "#516477",
        axisAccent: "#b96c2f",
        splitLine: "rgba(110, 130, 148, 0.2)",
        tokenLine: "#0ea5a5",
        tokenArea: "rgba(14, 165, 165, 0.14)",
        costLine: "#ea580c",
        costArea: "rgba(234, 88, 12, 0.13)",
        pieLabel: "#1f2b38",
      };
    case "signal":
      return {
        axis: "#8ea8ff",
        axisAccent: "#ffb26b",
        splitLine: "rgba(95, 130, 255, 0.26)",
        tokenLine: "#22d3ee",
        tokenArea: "rgba(34, 211, 238, 0.2)",
        costLine: "#fb7185",
        costArea: "rgba(251, 113, 133, 0.18)",
        pieLabel: "#d5e7ff",
      };
    case "sand":
    default:
      return {
        axis: "#738180",
        axisAccent: "#c58d6d",
        splitLine: "rgba(115, 129, 128, 0.15)",
        tokenLine: "#1ba784",
        tokenArea: "rgba(27, 167, 132, 0.12)",
        costLine: "#ff8c42",
        costArea: "rgba(255, 140, 66, 0.12)",
        pieLabel: "#f4efe7",
      };
  }
}

function detectInitialTheme(): ThemeId {
  const skin = readAppearanceQuery("skin");
  if (isTheme(skin)) return skin;
  if (typeof window === "undefined") return "sand";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : "sand";
}

function detectInitialLayoutTheme(): LayoutThemeId {
  const layout = readAppearanceQuery("layout");
  if (isLayoutTheme(layout)) return layout;
  if (typeof window === "undefined") return "console";
  const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
  return isLayoutTheme(stored) ? stored : "console";
}

function isTheme(value: string | null): value is ThemeId {
  return THEMES.includes(value as ThemeId);
}

function isLayoutTheme(value: string | null): value is LayoutThemeId {
  return LAYOUT_THEMES.includes(value as LayoutThemeId);
}

function readAppearanceQuery(key: "skin" | "layout"): string | null {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  return search.get(key);
}
