import { useEffect, useState } from "react";
import { type FilterOptions, type UsageFilter } from "../lib/api";
import { useLocale } from "../lib/i18n";

type FilterDrawerProps = {
  open: boolean;
  filter: UsageFilter;
  options?: FilterOptions;
  onClose: () => void;
  onChange: (next: UsageFilter) => void;
};

export default function FilterDrawer({
  open,
  filter,
  options,
  onClose,
  onChange,
}: FilterDrawerProps) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<UsageFilter>(filter);
  const sourceOptions = options?.sources ?? [];
  const providerOptions = options?.providers ?? [];
  const modelOptions = options?.models ?? [];
  const projectOptions = options?.projects ?? [];
  const familyOptions = options?.model_families ?? [];

  useEffect(() => {
    if (open) {
      setDraft(filter);
    }
  }, [open, filter]);

  const apply = () => {
    onChange({
      ...draft,
      timezone: draft.timezone?.trim() || undefined,
    });
    onClose();
  };

  const reset = () => {
    setDraft({
      ...draft,
      sources: [],
      providers: [],
      models: [],
      modelFamilies: [],
      projects: [],
      since: undefined,
      until: undefined,
      mode: undefined,
      minTokens: undefined,
      maxTokens: undefined,
      minCost: undefined,
      maxCost: undefined,
    });
  };

  return (
    <aside className={open ? "drawer open" : "drawer"}>
      <div className="drawer-header">
        <h3>{t("drawer.title")}</h3>
      </div>

      <div className="drawer-body">
        <label>
          {t("drawer.startDate")}
          <input
            type="date"
            value={draft.since ?? ""}
            onChange={(event) => setDraft({ ...draft, since: event.target.value || undefined })}
          />
        </label>

        <label>
          {t("drawer.endDate")}
          <input
            type="date"
            value={draft.until ?? ""}
            onChange={(event) => setDraft({ ...draft, until: event.target.value || undefined })}
          />
        </label>

        <label>
          {t("drawer.mode")}
          <select
            value={draft.mode ?? ""}
            onChange={(event) => setDraft({ ...draft, mode: event.target.value || undefined })}
          >
            <option value="">{t("drawer.mode.all")}</option>
            <option value="interactive">{t("drawer.mode.interactive")}</option>
            <option value="headless">{t("drawer.mode.headless")}</option>
          </select>
        </label>

        <label>
          {t("drawer.minTokens")}
          <input
            type="number"
            value={draft.minTokens ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                minTokens: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          />
        </label>

        <label>
          {t("drawer.maxTokens")}
          <input
            type="number"
            value={draft.maxTokens ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                maxTokens: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          />
        </label>

        <label>
          {t("drawer.minCost")}
          <input
            type="number"
            step="0.01"
            value={draft.minCost ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                minCost: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          />
        </label>

        <label>
          {t("drawer.maxCost")}
          <input
            type="number"
            step="0.01"
            value={draft.maxCost ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                maxCost: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          />
        </label>

        <label>
          {t("drawer.timezone")}
          <input
            type="text"
            placeholder="Asia/Shanghai"
            value={draft.timezone ?? ""}
            onChange={(event) => setDraft({ ...draft, timezone: event.target.value || undefined })}
          />
        </label>

        <label>
          {t("drawer.source")}
          <select
            multiple
            value={draft.sources}
            onChange={(event) => setDraft({ ...draft, sources: getMultiValues(event.target.selectedOptions) })}
          >
            {sourceOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        <label>
          {t("drawer.provider")}
          <select
            multiple
            value={draft.providers}
            onChange={(event) => setDraft({ ...draft, providers: getMultiValues(event.target.selectedOptions) })}
          >
            {providerOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        <label>
          {t("drawer.modelFamily")}
          <select
            multiple
            value={draft.modelFamilies}
            onChange={(event) =>
              setDraft({ ...draft, modelFamilies: getMultiValues(event.target.selectedOptions) })
            }
          >
            {familyOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        <label>
          {t("drawer.model")}
          <select
            multiple
            value={draft.models}
            onChange={(event) => setDraft({ ...draft, models: getMultiValues(event.target.selectedOptions) })}
          >
            {modelOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>

        <label>
          {t("drawer.project")}
          <select
            multiple
            value={draft.projects}
            onChange={(event) => setDraft({ ...draft, projects: getMultiValues(event.target.selectedOptions) })}
          >
            {projectOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="drawer-actions">
        <button className="button ghost" onClick={onClose}>
          {t("drawer.close")}
        </button>
        <button className="button ghost" onClick={reset}>
          {t("drawer.reset")}
        </button>
        <button className="button" onClick={apply}>
          {t("drawer.apply")}
        </button>
      </div>
    </aside>
  );
}

function getMultiValues(options: HTMLCollectionOf<HTMLOptionElement>) {
  return Array.from(options)
    .filter((item) => item.selected)
    .map((item) => item.value);
}
