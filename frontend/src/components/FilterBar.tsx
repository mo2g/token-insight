import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatNumber } from "../lib/format";
import { useLocale } from "../lib/i18n";
import { type UsageFilter } from "../lib/api";

type TokenModelOption = {
  value: string;
  label: string;
  tokens: number;
};

type FilterBarProps = {
  filter: UsageFilter;
  tokenModelOptions: TokenModelOption[];
  pinned: boolean;
  showInlineTools: boolean;
  activeFilterCount: number;
  onTogglePinned: () => void;
  onScrollTop: () => void;
  onRefresh: () => void;
  onOpenAdvanced: () => void;
  onChange: (next: UsageFilter) => void;
  onClear: () => void;
  onResetLayout: () => void;
  layoutCustomized: boolean;
};

type OverlayPosition = {
  left: number;
  top: number;
  width: number;
};

export default function FilterBar({
  filter,
  tokenModelOptions,
  pinned,
  showInlineTools,
  activeFilterCount,
  onTogglePinned,
  onScrollTop,
  onRefresh,
  onOpenAdvanced,
  onChange,
  onClear,
  onResetLayout,
  layoutCustomized,
}: FilterBarProps) {
  const { t } = useLocale();
  const [searchDraft, setSearchDraft] = useState(filter.search ?? "");
  const [modelSearch, setModelSearch] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState<OverlayPosition | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const modelOverlayRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const presets = [
    { value: "today", label: t("filter.preset.today") },
    { value: "week", label: t("filter.preset.week") },
    { value: "recent30d", label: t("filter.preset.recent30d") },
    { value: "year", label: t("filter.preset.year") },
    { value: "all", label: t("filter.preset.all") },
  ];

  useEffect(() => {
    setSearchDraft(filter.search ?? "");
  }, [filter.search]);

  useEffect(() => {
    if (!modelOpen) return;

    const updateOverlay = () => {
      const trigger = modelButtonRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const width = Math.min(360, Math.max(280, rect.width));
      const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
      setOverlayPosition({
        left,
        top: rect.bottom + 8,
        width,
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (modelOverlayRef.current?.contains(target)) return;
      setModelOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModelOpen(false);
      }
    };

    updateOverlay();
    const resizeObserver =
      typeof ResizeObserver === "undefined" || !modelButtonRef.current
        ? null
        : new ResizeObserver(() => updateOverlay());
    if (resizeObserver && modelButtonRef.current) {
      resizeObserver.observe(modelButtonRef.current);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updateOverlay);
    window.addEventListener("scroll", updateOverlay, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updateOverlay);
      window.removeEventListener("scroll", updateOverlay, true);
    };
  }, [modelOpen]);

  const selectedModelSet = useMemo(() => new Set(filter.models), [filter.models]);
  const visibleModelOptions = useMemo(() => {
    const keyword = modelSearch.trim().toLowerCase();
    if (!keyword) return tokenModelOptions;
    return tokenModelOptions.filter((option) =>
      option.label.toLowerCase().includes(keyword),
    );
  }, [modelSearch, tokenModelOptions]);

  const chips = useMemo(() => {
    const next: Array<{ key: string; label: string; remove: () => void }> = [];
    if (filter.search) {
      next.push({
        key: `search:${filter.search}`,
        label: t("filter.chip.search", { value: filter.search }),
        remove: () => onChange({ ...filter, search: undefined }),
      });
    }
    for (const source of filter.sources) {
      next.push({
        key: `source:${source}`,
        label: t("filter.chip.source", { value: source }),
        remove: () =>
          onChange({
            ...filter,
            sources: filter.sources.filter((item) => item !== source),
          }),
      });
    }
    for (const provider of filter.providers) {
      next.push({
        key: `provider:${provider}`,
        label: t("filter.chip.provider", { value: provider }),
        remove: () =>
          onChange({
            ...filter,
            providers: filter.providers.filter((item) => item !== provider),
          }),
      });
    }
    for (const modelFamily of filter.modelFamilies) {
      next.push({
        key: `family:${modelFamily}`,
        label: t("filter.chip.family", { value: modelFamily }),
        remove: () =>
          onChange({
            ...filter,
            modelFamilies: filter.modelFamilies.filter((item) => item !== modelFamily),
          }),
      });
    }
    for (const model of filter.models) {
      next.push({
        key: `model:${model}`,
        label: t("filter.chip.model", { value: model }),
        remove: () =>
          onChange({
            ...filter,
            models: filter.models.filter((item) => item !== model),
          }),
      });
    }
    for (const project of filter.projects) {
      next.push({
        key: `project:${project}`,
        label: t("filter.chip.project", { value: project }),
        remove: () =>
          onChange({
            ...filter,
            projects: filter.projects.filter((item) => item !== project),
          }),
      });
    }
    if (filter.mode) {
      next.push({
        key: `mode:${filter.mode}`,
        label: t("filter.chip.mode", { value: filter.mode }),
        remove: () => onChange({ ...filter, mode: undefined }),
      });
    }
    if (filter.excludeArchived) {
      next.push({
        key: "exclude-archived",
        label: t("filter.chip.excludeArchived"),
        remove: () => onChange({ ...filter, excludeArchived: false }),
      });
    }
    return next;
  }, [filter, onChange, t]);

  const modelSummary = useMemo(() => {
    if (filter.models.length === 0) {
      return t("filter.modelSpend.button");
    }
    if (filter.models.length === 1) {
      return filter.models[0];
    }
    return t("filter.modelSpend.selected", { count: filter.models.length });
  }, [filter.models, t]);

  const applySearch = () => {
    onChange({ ...filter, search: searchDraft.trim() || undefined });
  };

  const toggleModel = (model: string) => {
    const nextModels = selectedModelSet.has(model)
      ? filter.models.filter((item) => item !== model)
      : [...filter.models, model];
    onChange({ ...filter, models: nextModels });
  };

  return (
    <div ref={rootRef} className={pinned ? "filter-bar pinned" : "filter-bar"}>
      <div className="filter-main">
        <div className="filter-row primary">
          <div className="quick-presets" role="group" aria-label={t("filter.aria.datePresets")}>
            {presets.map((preset) => (
              <button
                key={preset.value}
                className={filter.preset === preset.value ? "preset-button active" : "preset-button"}
                aria-pressed={filter.preset === preset.value}
                onClick={() => onChange({ ...filter, preset: preset.value })}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <label className="search-inline">
            <input
              type="text"
              value={searchDraft}
              placeholder={t("filter.searchPlaceholder")}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applySearch();
                }
              }}
            />
          </label>

          <button className="button ghost" onClick={applySearch}>
            {t("filter.searchApply")}
          </button>

          <button
            ref={modelButtonRef}
            type="button"
            className={filter.models.length > 0 ? "model-spend-button active" : "model-spend-button"}
            onClick={() => setModelOpen((previous) => !previous)}
          >
            {modelSummary}
          </button>

          <button
            className={filter.excludeArchived ? "button" : "button ghost"}
            onClick={() => onChange({ ...filter, excludeArchived: !filter.excludeArchived })}
          >
            {t("filter.excludeArchived")}
          </button>
        </div>

        {chips.length > 0 ? (
          <div className="filter-pill-group">
            {chips.map((chip) => (
              <button key={chip.key} className="filter-pill removable" onClick={chip.remove}>
                {chip.label} ×
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="filter-actions">
        {showInlineTools ? (
          <button type="button" className="button ghost inline-top" onClick={onScrollTop}>
            {t("dock.scrollTopShort")}
          </button>
        ) : null}
        <span className={activeFilterCount > 0 ? "filter-deck-badge active" : "filter-deck-badge"}>
          {activeFilterCount > 0
            ? t("filter.deck.activeCount", { count: activeFilterCount })
            : t("filter.deck.idle")}
        </span>
        <button
          type="button"
          className={pinned ? "button pin-toggle" : "button ghost pin-toggle"}
          onClick={onTogglePinned}
        >
          {pinned ? t("filter.unpin") : t("filter.pin")}
        </button>
        <button className="button ghost" onClick={onOpenAdvanced}>
          {t("filter.advanced")}
        </button>
        <button className={layoutCustomized ? "button" : "button ghost"} onClick={onResetLayout}>
          {t("filter.resetLayout")}
        </button>
        <button className="button ghost" onClick={onClear}>
          {t("filter.clear")}
        </button>
        <button className="button" onClick={onRefresh}>
          {t("filter.refreshNow")}
        </button>
      </div>

      {modelOpen && overlayPosition
        ? createPortal(
            <div
              ref={modelOverlayRef}
              className="model-spend-overlay"
              style={{
                left: `${overlayPosition.left}px`,
                top: `${overlayPosition.top}px`,
                width: `${overlayPosition.width}px`,
              }}
            >
              <input
                type="text"
                value={modelSearch}
                placeholder={t("filter.modelSpend.searchPlaceholder")}
                onChange={(event) => setModelSearch(event.target.value)}
              />
              <div className="model-spend-options">
                {visibleModelOptions.length === 0 ? (
                  <p>{t("filter.modelSpend.empty")}</p>
                ) : (
                  visibleModelOptions.map((option) => (
                    <label key={option.value} className="model-spend-option">
                      <input
                        type="checkbox"
                        checked={selectedModelSet.has(option.value)}
                        onChange={() => toggleModel(option.value)}
                      />
                      <span>{option.label}</span>
                      <em>{formatNumber(option.tokens)}</em>
                    </label>
                  ))
                )}
              </div>
              {filter.models.length > 0 ? (
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => onChange({ ...filter, models: [] })}
                >
                  {t("filter.modelSpend.clear")}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
