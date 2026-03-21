import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Panel from "../components/Panel";
import { type SocialPreset, filterToQuery, renderSocialImage } from "../lib/api";
import { defaultFilter, mergeFilter, parseFilter } from "../lib/filters";
import { useLocale } from "../lib/i18n";

const SOCIAL_PRESETS: SocialPreset[] = [
  "summary",
  "wrapped",
  "command-deck",
  "signal-grid",
];

type CachedPreview = {
  url: string;
  signature: string;
};

export default function SocialImagePage() {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const filter = useMemo(
    () => mergeFilter(defaultFilter, parseFilter(searchParams)),
    [searchParams],
  );
  const filterSignature = useMemo(() => filterToQuery(filter).toString(), [filter]);
  const [preset, setPreset] = useState<SocialPreset>("summary");
  const [busyPreset, setBusyPreset] = useState<SocialPreset>();
  const [error, setError] = useState<string>();
  const [cache, setCache] = useState<Partial<Record<SocialPreset, CachedPreview>>>({});
  const cacheRef = useRef<Partial<Record<SocialPreset, CachedPreview>>>({});

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  useEffect(
    () => () => {
      for (const item of Object.values(cacheRef.current)) {
        if (item) {
          URL.revokeObjectURL(item.url);
        }
      }
    },
    [],
  );

  const activePreview = cache[preset];
  const activeStale = activePreview
    ? activePreview.signature !== filterSignature
    : false;

  const generate = async () => {
    setBusyPreset(preset);
    setError(undefined);
    try {
      const blob = await renderSocialImage(preset, filter);
      const url = URL.createObjectURL(blob);
      setCache((previous) => {
        const previousItem = previous[preset];
        if (previousItem) {
          URL.revokeObjectURL(previousItem.url);
        }
        return {
          ...previous,
          [preset]: { url, signature: filterSignature },
        };
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "unknown";
      setError(`${t("social.error")}: ${message}`);
    } finally {
      setBusyPreset(undefined);
    }
  };

  return (
    <div className="social-page">
      <Panel title={t("social.title")} subtitle={t("social.subtitle")}>
        <div className="social-template-grid">
          {SOCIAL_PRESETS.map((item) => {
            const itemPreview = cache[item];
            const itemStale = itemPreview
              ? itemPreview.signature !== filterSignature
              : false;
            return (
              <button
                key={item}
                className={item === preset ? "social-template active" : "social-template"}
                onClick={() => setPreset(item)}
              >
                <TemplateMock preset={item} compact />
                <div className="social-template-meta">
                  <strong>{templateLabel(t, item)}</strong>
                  <span>{templateDescription(t, item)}</span>
                  <em
                    className={
                      itemPreview ? (itemStale ? "stale" : "fresh") : "pending"
                    }
                  >
                    {itemPreview
                      ? itemStale
                        ? t("social.cache.stale")
                        : t("social.cache.ready")
                      : t("social.cache.empty")}
                  </em>
                </div>
              </button>
            );
          })}
        </div>
        <div className="social-controls">
          <button
            className="button"
            onClick={() => void generate()}
            disabled={Boolean(busyPreset)}
          >
            {busyPreset === preset ? t("social.generating") : t("social.generate")}
          </button>
          {activePreview ? (
            <a
              className="button ghost panel-ghost"
              href={activePreview.url}
              download={`token-insight-${preset}.png`}
            >
              {t("social.download")}
            </a>
          ) : null}
          <span
            className={
              activePreview
                ? activeStale
                  ? "social-cache-tag stale"
                  : "social-cache-tag fresh"
                : "social-cache-tag"
            }
          >
            {activePreview
              ? activeStale
                ? t("social.cache.currentStale")
                : t("social.cache.currentReady")
              : t("social.cache.currentEmpty")}
          </span>
        </div>
        {error ? <p className="social-error">{error}</p> : null}
        <div className="social-preview">
          {activePreview ? (
            <img src={activePreview.url} alt={t("social.previewAlt")} />
          ) : (
            <div className="social-preview-mock">
              <TemplateMock preset={preset} />
              <p>{t("social.empty")}</p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function templateLabel(t: ReturnType<typeof useLocale>["t"], preset: SocialPreset) {
  switch (preset) {
    case "summary":
      return t("social.template.summary");
    case "wrapped":
      return t("social.template.wrapped");
    case "command-deck":
      return t("social.template.commandDeck");
    case "signal-grid":
      return t("social.template.signalGrid");
  }
}

function templateDescription(t: ReturnType<typeof useLocale>["t"], preset: SocialPreset) {
  switch (preset) {
    case "summary":
      return t("social.template.summary.desc");
    case "wrapped":
      return t("social.template.wrapped.desc");
    case "command-deck":
      return t("social.template.commandDeck.desc");
    case "signal-grid":
      return t("social.template.signalGrid.desc");
  }
}

function TemplateMock({
  preset,
  compact = false,
}: {
  preset: SocialPreset;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? `template-mock ${preset} compact` : `template-mock ${preset}`}
      aria-hidden="true"
    >
      <div className="template-mock-head">
        <span>TOKEN INSIGHT</span>
        <span>{preset.toUpperCase()}</span>
      </div>
      <div className="template-mock-row">
        <div />
        <div />
        <div />
      </div>
      <div className="template-mock-chart" />
      <div className="template-mock-row thin">
        <div />
        <div />
      </div>
    </div>
  );
}
