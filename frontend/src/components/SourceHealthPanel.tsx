import { useEffect, useMemo, useState } from "react";
import type { SourceStatus } from "../lib/api";
import { formatDate } from "../lib/format";
import { useLocale } from "../lib/i18n";
import {
  type SourceHealthCollapseState,
  type SourceHealthGroupId,
  buildSourceHealthGroups,
  defaultSourceHealthCollapse,
} from "../lib/sourceHealth";

type SourceHealthPanelProps = {
  items: SourceStatus[];
  variant?: "detail" | "summary";
};

type HealthViewMode = "all" | "alerts";

export default function SourceHealthPanel({
  items,
  variant = "detail",
}: SourceHealthPanelProps) {
  const { locale, t } = useLocale();
  const [viewMode, setViewMode] = useState<HealthViewMode>("all");
  const [detailsOpen, setDetailsOpen] = useState(variant === "detail");
  const groups = useMemo(() => buildSourceHealthGroups(items), [items]);
  const hasAlerts = groups.alerts.length > 0;
  const highlightRows = hasAlerts ? groups.alerts.slice(0, 3) : groups.active.slice(0, 3);
  const latestScanAt = useMemo(() => findLatestScan(items), [items]);
  const defaultCollapsed = useMemo(
    () => defaultSourceHealthCollapse(groups),
    [groups],
  );
  const [collapsed, setCollapsed] = useState<SourceHealthCollapseState>(
    defaultCollapsed,
  );

  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  useEffect(() => {
    if (variant === "detail") {
      setDetailsOpen(true);
    }
  }, [variant]);

  if (items.length === 0) {
    return <div className="empty-state">{t("health.empty")}</div>;
  }

  return (
    <div className={`health-groups variant-${variant}`}>
      <div className="health-toolbar">
        <p className="health-sort-note">{t("health.sortHint")}</p>
        <div className="health-toolbar-controls">
          <div className="health-view-switch" role="group" aria-label={t("panel.health.title")}>
            <button
              className={viewMode === "all" ? "health-view-button active" : "health-view-button"}
              aria-pressed={viewMode === "all"}
              onClick={() => setViewMode("all")}
            >
              {t("health.view.all")}
            </button>
            <button
              className={
                viewMode === "alerts" ? "health-view-button active" : "health-view-button"
              }
              aria-pressed={viewMode === "alerts"}
              onClick={() => setViewMode("alerts")}
            >
              {t("health.view.alertsOnly")}
            </button>
          </div>
          {variant === "summary" ? (
            <button className="health-toggle-details" onClick={() => setDetailsOpen((value) => !value)}>
              {detailsOpen ? t("health.summary.hideDetails") : t("health.summary.showDetails")}
            </button>
          ) : null}
        </div>
      </div>
      {variant === "summary" ? (
        <>
          <section className="health-summary-grid">
            <article>
              <span>{t("health.summary.alerts")}</span>
              <strong>{groups.alerts.length}</strong>
            </article>
            <article>
              <span>{t("health.summary.active")}</span>
              <strong>{groups.active.length}</strong>
            </article>
            <article>
              <span>{t("health.summary.empty")}</span>
              <strong>{groups.empty.length}</strong>
            </article>
            <article>
              <span>{t("health.summary.lastScan")}</span>
              <strong>{formatDate(latestScanAt, locale, t("common.na"))}</strong>
            </article>
          </section>
          <section className="health-highlight-list">
            <header>
              <strong>
                {hasAlerts
                  ? t("health.summary.alertHighlights")
                  : t("health.summary.activeHighlights")}
              </strong>
            </header>
            {highlightRows.length === 0 ? (
              <p className="health-highlight-empty">{t("health.alertsOnlyEmpty")}</p>
            ) : (
              highlightRows.map((item) => (
                <article key={`highlight-${item.source}`} className="health-highlight-row">
                  <strong>{item.label}</strong>
                  <span>
                    {t("health.events", { count: item.imported_events })}
                    {" · "}
                    {t("health.artifacts", { count: item.discovered_artifacts })}
                  </span>
                </article>
              ))
            )}
          </section>
        </>
      ) : null}
      {detailsOpen || variant === "detail" ? (
        <div className={variant === "summary" ? "health-details-scroll" : undefined}>
          {viewMode === "alerts" && !hasAlerts ? (
            <div className="empty-state">{t("health.alertsOnlyEmpty")}</div>
          ) : null}
          {viewMode === "alerts" && hasAlerts ? (
            renderGroup(
              "alerts",
              groups.alerts,
              collapsed,
              setCollapsed,
              locale,
              t,
            )
          ) : null}
          {viewMode === "all" ? (
            <>
              {renderGroup(
                "alerts",
                groups.alerts,
                collapsed,
                setCollapsed,
                locale,
                t,
              )}
              {renderGroup(
                "active",
                groups.active,
                collapsed,
                setCollapsed,
                locale,
                t,
              )}
              {renderGroup(
                "empty",
                groups.empty,
                collapsed,
                setCollapsed,
                locale,
                t,
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function renderGroup(
  groupId: SourceHealthGroupId,
  rows: SourceStatus[],
  collapsed: SourceHealthCollapseState,
  setCollapsed: (
    updater: (previous: SourceHealthCollapseState) => SourceHealthCollapseState,
  ) => void,
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
) {
  if (rows.length === 0) return null;
  const isCollapsed = collapsed[groupId];
  return (
    <section className={`health-group ${groupId}`}>
      <button
        className="health-group-toggle"
        onClick={() =>
          setCollapsed((previous) => ({
            ...previous,
            [groupId]: !previous[groupId],
          }))
        }
      >
        <strong>{groupLabel(groupId, rows.length, t)}</strong>
        <span>{isCollapsed ? t("health.group.expand") : t("health.group.collapse")}</span>
      </button>
      {isCollapsed ? null : (
        <div className="status-list">
          {rows.map((item) => (
            <article key={item.source} className="status-card">
              <header>
                <strong>{item.label}</strong>
                <span className="status-mode">{item.mode}</span>
              </header>
              <p>{t("health.events", { count: item.imported_events })}</p>
              <p>{t("health.artifacts", { count: item.discovered_artifacts })}</p>
              <p>
                {t("health.lastScan", {
                  value: formatDate(item.last_scan_completed_at, locale, t("common.na")),
                })}
              </p>
              <p>
                {t("health.duration", {
                  value: formatDuration(item.last_duration_ms, t("common.na")),
                })}
              </p>
              {item.last_error ? <p className="status-error">{item.last_error}</p> : null}
              {item.watched_paths.length > 0 ? (
                <details className="status-paths">
                  <summary>{t("health.paths", { count: item.watched_paths.length })}</summary>
                  <div className="status-path-list">
                    {item.watched_paths.map((path) => (
                      <code key={`${item.source}-${path}`}>{path}</code>
                    ))}
                  </div>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function groupLabel(
  group: SourceHealthGroupId,
  count: number,
  t: ReturnType<typeof useLocale>["t"],
) {
  switch (group) {
    case "alerts":
      return t("health.group.alerts", { count });
    case "active":
      return t("health.group.active", { count });
    case "empty":
      return t("health.group.empty", { count });
  }
}

function formatDuration(durationMs: number | undefined, naText: string) {
  if (!durationMs || durationMs <= 0) return naText;
  if (durationMs >= 1000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${durationMs}ms`;
}

function findLatestScan(items: SourceStatus[]) {
  let latest: string | undefined;
  let latestValue = 0;
  for (const item of items) {
    if (!item.last_scan_completed_at) continue;
    const parsed = Date.parse(item.last_scan_completed_at);
    if (!Number.isFinite(parsed)) continue;
    if (parsed > latestValue) {
      latest = item.last_scan_completed_at;
      latestValue = parsed;
    }
  }
  return latest;
}
