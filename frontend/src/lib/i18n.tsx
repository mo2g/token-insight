import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  EN_MESSAGES,
  MESSAGES,
  SUPPORTED_LOCALES,
  type Locale,
  type MessageKey,
} from "./locales";

type TemplateValues = Record<string, string | number>;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: TemplateValues) => string;
};

const STORAGE_KEY = "token-insight.locale";

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>(() => detectInitialLocale());

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, locale);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
      document.title = MESSAGES[locale]["app.title"];
    }
  }, [locale]);

  const value: LocaleContextValue = {
    locale,
    setLocale,
    t: (key, values) => renderTemplate(MESSAGES[locale][key] ?? EN_MESSAGES[key], values),
  };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}

export { SUPPORTED_LOCALES, type Locale, type MessageKey };

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return "en";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isSupportedLocale(stored)) {
    return stored;
  }

  const languages = [window.navigator.language, ...window.navigator.languages];
  for (const language of languages) {
    if (isChineseLocale(language)) {
      return "zh-CN";
    }
    if (language.toLowerCase().startsWith("en")) {
      return "en";
    }
  }

  return "en";
}

function isSupportedLocale(value: string | null): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

function isChineseLocale(value: string) {
  return value.toLowerCase().startsWith("zh");
}

function renderTemplate(template: string, values?: TemplateValues) {
  if (!values) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    return value === undefined ? "" : String(value);
  });
}
