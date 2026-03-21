import { useEffect, useMemo, useState } from "react";
import { type UsageFilter } from "../lib/api";
import { useLocale } from "../lib/i18n";

type FilterBarProps = {
  filter: UsageFilter;
  onRefresh: () => void;
  onOpenAdvanced: () => void;
  onChange: (next: UsageFilter) => void;
  onClear: () => void;
};

export default function FilterBar({
  filter,
  onRefresh,
  onOpenAdvanced,
  onChange,
  onClear,
}: FilterBarProps) {
  const { t } = useLocale();
  const [searchDraft, setSearchDraft] = useState(filter.search ?? "");
  const presets = [
    { value: "today", label: t("filter.preset.today") },
    { value: "week", label: t("filter.preset.week") },
    { value: "month", label: t("filter.preset.month") },
    { value: "year", label: t("filter.preset.year") },
    { value: "all", label: t("filter.preset.all") },
  ];

  useEffect(() => {
    setSearchDraft(filter.search ?? "");
  }, [filter.search]);

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
    for (const model of filter.modelFamilies) {
      next.push({
        key: `family:${model}`,
        label: t("filter.chip.family", { value: model }),
        remove: () =>
          onChange({
            ...filter,
            modelFamilies: filter.modelFamilies.filter((item) => item !== model),
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

  const applySearch = () => {
    onChange({ ...filter, search: searchDraft.trim() || undefined });
  };

  return (
    <div className="filter-bar">
      <div className="filter-main">
        <div className="filter-row">
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
            className={filter.excludeArchived ? "button" : "button ghost"}
            onClick={() => onChange({ ...filter, excludeArchived: !filter.excludeArchived })}
          >
            {t("filter.excludeArchived")}
          </button>
        </div>
        <div className="filter-pill-group">
          {chips.length === 0 ? (
            <span className="filter-pill">{t("filter.currentDefault")}</span>
          ) : (
            chips.map((chip) => (
              <button key={chip.key} className="filter-pill removable" onClick={chip.remove}>
                {chip.label} ×
              </button>
            ))
          )}
        </div>
      </div>
      <div className="filter-actions">
        <button className="button ghost" onClick={onOpenAdvanced}>
          {t("filter.advanced")}
        </button>
        <button className="button ghost" onClick={onClear}>
          {t("filter.clear")}
        </button>
        <button className="button" onClick={onRefresh}>
          {t("filter.refreshNow")}
        </button>
      </div>
    </div>
  );
}
