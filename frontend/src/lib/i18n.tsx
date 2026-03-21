import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "token-insight.locale";

export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

type TemplateValues = Record<string, string | number>;

const EN_MESSAGES = {
  "app.title": "Token Insight",
  "app.eyebrow": "Mission Control / Telemetry",
  "app.subtitle":
    "Local multi-source token usage overview, deep filtering, live refresh, and share cards.",
  "nav.dashboard": "Dashboard",
  "nav.social": "Share Card",
  "nav.languageSwitchAria": "Interface language",
  "nav.language.en": "EN",
  "nav.language.zh": "中文",
  "common.na": "n/a",
  "filter.preset.today": "Today",
  "filter.preset.week": "7D",
  "filter.preset.month": "30D",
  "filter.preset.year": "YTD",
  "filter.preset.all": "All",
  "filter.aria.datePresets": "Date presets",
  "filter.searchPlaceholder": "Search models, providers, or paths",
  "filter.searchApply": "Apply Search",
  "filter.excludeArchived": "Exclude Archived",
  "filter.currentDefault": "Current: default scope",
  "filter.chip.search": "Search: {value}",
  "filter.chip.source": "Source: {value}",
  "filter.chip.family": "Family: {value}",
  "filter.chip.mode": "Mode: {value}",
  "filter.chip.excludeArchived": "Archived excluded",
  "filter.advanced": "Advanced Filters",
  "filter.clear": "Clear",
  "filter.refreshNow": "Refresh Now",
  "drawer.title": "Advanced Filters",
  "drawer.startDate": "Start date",
  "drawer.endDate": "End date",
  "drawer.mode": "Mode",
  "drawer.minTokens": "Min tokens",
  "drawer.maxTokens": "Max tokens",
  "drawer.minCost": "Min cost",
  "drawer.maxCost": "Max cost",
  "drawer.timezone": "Timezone",
  "drawer.source": "Sources",
  "drawer.provider": "Providers",
  "drawer.modelFamily": "Model families",
  "drawer.model": "Models",
  "drawer.project": "Project paths",
  "drawer.close": "Close",
  "drawer.reset": "Reset",
  "drawer.apply": "Apply Filters",
  "drawer.mode.all": "all",
  "drawer.mode.interactive": "interactive",
  "drawer.mode.headless": "headless",
  "table.dimension": "Dimension",
  "table.events": "Events",
  "table.tokens": "Tokens",
  "table.cost": "Cost",
  "table.reasoning": "Reasoning",
  "heatmap.empty": "No heatmap data for the current filter.",
  "heatmap.aria": "Contribution heatmap",
  "heatmap.cellTitle": "{day}: {tokens} tokens",
  "social.title": "Share Card",
  "social.subtitle":
    "Rust backend renders PNG directly using current URL filter conditions.",
  "social.template": "Template",
  "social.template.summary": "Summary card",
  "social.template.wrapped": "Annual wrapped",
  "social.template.commandDeck": "Command deck",
  "social.template.signalGrid": "Signal grid",
  "social.template.summary.desc": "Compact dashboard style with key numbers and activity map.",
  "social.template.wrapped.desc": "Poster style for highlights, great for timeline sharing.",
  "social.template.commandDeck.desc": "Cyber control-panel look with token structure bars.",
  "social.template.signalGrid.desc": "High-contrast tall layout for feed-first publishing.",
  "social.generating": "Generating...",
  "social.generate": "Generate Preview",
  "social.download": "Download PNG",
  "social.previewAlt": "Share image preview",
  "social.empty": "This is a template mock. Click \"Generate Preview\" to render with real data.",
  "social.cache.empty": "Not generated yet",
  "social.cache.ready": "Cached and up to date",
  "social.cache.stale": "Cached but stale",
  "social.cache.currentEmpty": "No generated image for current template",
  "social.cache.currentReady": "Current template image is cached",
  "social.cache.currentStale": "Current image uses previous filters; regenerate to refresh",
  "social.error": "Generate failed",
  "metric.totalTokens": "Total Tokens",
  "metric.eventsDetail": "Events {count}",
  "metric.estimatedCost": "Estimated Cost",
  "metric.topModelDetail": "Top model {model}",
  "metric.activeDays": "Active Days",
  "metric.streakDetail": "Longest streak {days}",
  "metric.lastRefresh": "Last Refresh",
  "metric.lastEventDetail": "Last event {value}",
  "panel.trend.title": "Token Trend",
  "panel.trend.subtitle": "Aggregated by {bucket}; showing {metric}.",
  "trend.aria.bucket": "Trend aggregation",
  "trend.aria.metric": "Trend metric",
  "trend.bucket.daily": "Daily",
  "trend.bucket.hourly": "Hourly",
  "trend.bucket.minutely": "Minutely",
  "trend.bucket.dailyShort": "Day",
  "trend.bucket.hourlyShort": "Hour",
  "trend.bucket.minutelyShort": "Min",
  "trend.metric.tokens": "Tokens",
  "trend.metric.cost": "Cost",
  "trend.metric.dual": "Tokens + Cost",
  "trend.metric.dualShort": "Dual",
  "trend.exportJson": "Export JSON",
  "trend.exportCsv": "Export CSV",
  "trend.series.tokens": "Tokens",
  "trend.series.cost": "Cost",
  "panel.sources.title": "Source Distribution",
  "panel.sources.subtitle": "Token share by client and source.",
  "panel.heatmap.title": "Contribution Heatmap",
  "panel.heatmap.subtitle": "Intensity across the latest 84 active days.",
  "panel.models.title": "Model Ranking",
  "panel.models.subtitle": "Aggregated by token and cost for model dimensions.",
  "panel.rankSources.title": "Source Ranking",
  "panel.rankSources.subtitle": "Contribution summary across platforms and tools.",
  "panel.health.title": "Source Health",
  "panel.health.subtitle": "Scan status, watched roots, and latest errors.",
  "health.artifacts": "Artifacts {count}",
  "health.events": "Events {count}",
  "health.lastScan": "Last scan {value}",
} as const;

type MessageKey = keyof typeof EN_MESSAGES;

const ZH_MESSAGES: Record<MessageKey, string> = {
  "app.title": "Token Insight",
  "app.eyebrow": "任务控制台 / 遥测总览",
  "app.subtitle": "本地多源 token 使用总览、深度筛选、实时刷新与分享图。",
  "nav.dashboard": "看板",
  "nav.social": "分享图",
  "nav.languageSwitchAria": "界面语言",
  "nav.language.en": "EN",
  "nav.language.zh": "中文",
  "common.na": "暂无",
  "filter.preset.today": "今天",
  "filter.preset.week": "7天",
  "filter.preset.month": "30天",
  "filter.preset.year": "今年",
  "filter.preset.all": "全部",
  "filter.aria.datePresets": "日期预设",
  "filter.searchPlaceholder": "搜索模型、provider、路径",
  "filter.searchApply": "应用搜索",
  "filter.excludeArchived": "排除归档",
  "filter.currentDefault": "当前: 默认口径",
  "filter.chip.search": "搜索: {value}",
  "filter.chip.source": "来源: {value}",
  "filter.chip.family": "模型族: {value}",
  "filter.chip.mode": "模式: {value}",
  "filter.chip.excludeArchived": "已排除归档",
  "filter.advanced": "高级筛选",
  "filter.clear": "清空",
  "filter.refreshNow": "立即刷新",
  "drawer.title": "高级筛选",
  "drawer.startDate": "开始日期",
  "drawer.endDate": "结束日期",
  "drawer.mode": "模式",
  "drawer.minTokens": "最小 token",
  "drawer.maxTokens": "最大 token",
  "drawer.minCost": "最小 cost",
  "drawer.maxCost": "最大 cost",
  "drawer.timezone": "时区",
  "drawer.source": "来源",
  "drawer.provider": "Provider",
  "drawer.modelFamily": "Model family",
  "drawer.model": "Model",
  "drawer.project": "项目路径",
  "drawer.close": "关闭",
  "drawer.reset": "重置",
  "drawer.apply": "应用筛选",
  "drawer.mode.all": "全部",
  "drawer.mode.interactive": "交互",
  "drawer.mode.headless": "无头",
  "table.dimension": "维度",
  "table.events": "Events",
  "table.tokens": "Tokens",
  "table.cost": "Cost",
  "table.reasoning": "Reasoning",
  "heatmap.empty": "当前筛选下没有热力图数据。",
  "heatmap.aria": "贡献热力图",
  "heatmap.cellTitle": "{day}: {tokens} tokens",
  "social.title": "社交分享图",
  "social.subtitle": "后端用 Rust 直接生成 PNG，使用当前 URL 筛选条件。",
  "social.template": "模板",
  "social.template.summary": "摘要卡片",
  "social.template.wrapped": "年度回顾",
  "social.template.commandDeck": "指挥面板",
  "social.template.signalGrid": "信号矩阵",
  "social.template.summary.desc": "紧凑仪表盘风格，突出关键指标和活跃热力图。",
  "social.template.wrapped.desc": "海报感排版，适合做阶段/年度总结分享。",
  "social.template.commandDeck.desc": "科技控制台视觉，突出 token 结构占比。",
  "social.template.signalGrid.desc": "高对比竖版布局，适合信息流发布。",
  "social.generating": "生成中...",
  "social.generate": "生成预览",
  "social.download": "下载 PNG",
  "social.previewAlt": "社交图片预览",
  "social.empty": "当前展示的是模板示意图，点击“生成预览”后将使用真实数据渲染。",
  "social.cache.empty": "尚未生成",
  "social.cache.ready": "已缓存且为最新",
  "social.cache.stale": "已缓存但已过期",
  "social.cache.currentEmpty": "当前模板暂无已生成图片",
  "social.cache.currentReady": "当前模板图片已缓存",
  "social.cache.currentStale": "当前图片对应旧筛选条件，请重新生成",
  "social.error": "生成失败",
  "metric.totalTokens": "总 Tokens",
  "metric.eventsDetail": "Events {count}",
  "metric.estimatedCost": "估算成本",
  "metric.topModelDetail": "Top model {model}",
  "metric.activeDays": "活跃天数",
  "metric.streakDetail": "最长 streak {days}",
  "metric.lastRefresh": "最近刷新",
  "metric.lastEventDetail": "最近事件 {value}",
  "panel.trend.title": "Token 趋势",
  "panel.trend.subtitle": "按{bucket}聚合，当前显示{metric}走势",
  "trend.aria.bucket": "趋势聚合粒度",
  "trend.aria.metric": "趋势指标",
  "trend.bucket.daily": "日",
  "trend.bucket.hourly": "小时",
  "trend.bucket.minutely": "分钟",
  "trend.bucket.dailyShort": "日",
  "trend.bucket.hourlyShort": "小时",
  "trend.bucket.minutelyShort": "分钟",
  "trend.metric.tokens": "Token",
  "trend.metric.cost": "成本",
  "trend.metric.dual": "Token + 成本",
  "trend.metric.dualShort": "双轴",
  "trend.exportJson": "导出 JSON",
  "trend.exportCsv": "导出 CSV",
  "trend.series.tokens": "Tokens",
  "trend.series.cost": "Cost",
  "panel.sources.title": "来源分布",
  "panel.sources.subtitle": "不同 client/source 的 token 占比",
  "panel.heatmap.title": "贡献热力图",
  "panel.heatmap.subtitle": "最近 84 个活跃日的强度分布",
  "panel.models.title": "模型排行",
  "panel.models.subtitle": "按 token 与 cost 聚合的模型维度",
  "panel.rankSources.title": "来源排行",
  "panel.rankSources.subtitle": "不同平台/工具的汇总贡献",
  "panel.health.title": "来源健康度",
  "panel.health.subtitle": "扫描状态、监听根目录与异常提示",
  "health.artifacts": "artifacts {count}",
  "health.events": "events {count}",
  "health.lastScan": "last scan {value}",
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en: EN_MESSAGES,
  "zh-CN": ZH_MESSAGES,
};

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: TemplateValues) => string;
};

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
  return value === "en" || value === "zh-CN";
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
