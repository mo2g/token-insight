import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ContributionCell } from "../lib/api";
import { formatNumber, formatUsd } from "../lib/format";
import { useLocale } from "../lib/i18n";
import {
  buildHeatmapCycles,
  loadHeatmapCycleOrder,
  moveHeatmapCycleOrder,
  normalizeHeatmapCycleSettings,
  reorderHeatmapCycles,
  saveHeatmapCycleOrder,
  type HeatmapCycle,
  type HeatmapCycleSettings,
} from "../lib/heatmapCycles";

type HeatmapVariant = "full" | "compact" | "micro";

type ContributionHeatmapProps = {
  cells: ContributionCell[];
  variant?: HeatmapVariant;
  settings: HeatmapCycleSettings;
  onSettingsChange: (next: HeatmapCycleSettings) => void;
};

export default function ContributionHeatmap({
  cells,
  variant = "full",
  settings,
  onSettingsChange,
}: ContributionHeatmapProps) {
  const { locale, t } = useLocale();
  const [cycleOrder, setCycleOrder] = useState(() => loadHeatmapCycleOrder());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const normalizedSettings = useMemo(
    () => normalizeHeatmapCycleSettings(settings),
    [settings],
  );
  const cycleBundle = useMemo(
    () => buildHeatmapCycles(cells, normalizedSettings),
    [cells, normalizedSettings],
  );
  const dayColumns = variant === "micro"
    ? Math.min(10, cycleBundle.cycleDays)
    : Math.min(14, cycleBundle.cycleDays);
  const orderedCycles = useMemo(
    () => reorderHeatmapCycles(cycleBundle.cycles, cycleOrder),
    [cycleBundle.cycles, cycleOrder],
  );
  const stripStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${dayColumns}, minmax(0, 1fr))`,
  };

  return (
    <section className={`heatmap-panel ${variant}`} aria-label={t("heatmap.aria")}>
      <div className="heatmap-cycle-toolbar">
        <label>
          <span>{t("heatmap.cycle.resetDate")}</span>
          <input
            type="date"
            value={normalizedSettings.resetDate}
            onChange={(event) =>
              onSettingsChange(
                normalizeHeatmapCycleSettings({
                  ...normalizedSettings,
                  resetDate: event.target.value,
                }),
              )}
          />
        </label>
        <label>
          <span>{t("heatmap.cycle.days")}</span>
          <input
            type="number"
            min={3}
            max={60}
            value={normalizedSettings.cycleDays}
            onChange={(event) =>
              onSettingsChange(
                normalizeHeatmapCycleSettings({
                  ...normalizedSettings,
                  cycleDays: Number(event.target.value),
                }),
              )}
          />
        </label>
      </div>

      <div className="heatmap-head">
        <div className="heatmap-legend">
          <span>{t("heatmap.legend.low")}</span>
          <div className="heatmap-legend-track">
            <i className="level-1" />
            <i className="level-2" />
            <i className="level-3" />
            <i className="level-4" />
            <i className="level-5" />
          </div>
          <span>{t("heatmap.legend.high")}</span>
        </div>
        <p className="heatmap-cycle-anchor">
          {t("heatmap.cycle.anchor", {
            day: formatCalendarDay(cycleBundle.currentCycleEnd, locale),
          })}
        </p>
      </div>

      <div className="heatmap-cycle-grid">
        {orderedCycles.map((cycle) => (
          <article
            key={cycle.id}
            className={cycleCardClassName(cycle.id, draggingId, dropTargetId)}
            onDragOver={(event) => {
              event.preventDefault();
              if (dropTargetId !== cycle.id) {
                setDropTargetId(cycle.id);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = draggingId ?? event.dataTransfer.getData("text/plain");
              if (!sourceId) return;
              setCycleOrder((current) => {
                const next = moveHeatmapCycleOrder(current, sourceId, cycle.id);
                saveHeatmapCycleOrder(next);
                return next;
              });
              setDraggingId(null);
              setDropTargetId(null);
            }}
          >
            <header className="heatmap-cycle-card-header">
              <div className="heatmap-cycle-card-copy">
                <strong>{cycleLabel(cycle, t)}</strong>
                <p>{formatCycleRange(cycle.startDay, cycle.endDay, locale)}</p>
              </div>
              <button
                type="button"
                className="heatmap-cycle-grip"
                draggable
                aria-label={t("heatmap.cycle.drag")}
                title={t("heatmap.cycle.drag")}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", cycle.id);
                  setDraggingId(cycle.id);
                  setDropTargetId(cycle.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropTargetId(null);
                }}
              >
                ⋮⋮
              </button>
            </header>
            <div className="heatmap-cycle-metrics">
              <span>
                {t("heatmap.cycle.tokens")}
                <strong>{formatNumber(cycle.totalTokens)}</strong>
              </span>
              <span>
                {t("heatmap.cycle.cost")}
                <strong>{formatUsd(cycle.totalCostUsd, locale)}</strong>
              </span>
              <span>
                {t("heatmap.cycle.activeDays")}
                <strong>{cycle.activeDays}</strong>
              </span>
            </div>
            <div className="heatmap-cycle-strip" style={stripStyle}>
              {cycle.days.map((day, dayIndex) => {
                const title = t("heatmap.cellTitle", {
                  day: formatCalendarDay(day.day, locale),
                  tokens: formatNumber(day.totalTokens),
                  cost: formatUsd(day.totalCostUsd, locale),
                });
                return (
                  <button
                    key={day.day}
                    type="button"
                    className={`heat-cell level-${day.level}${day.active ? " active" : ""}${isWeekCut(dayIndex) ? " week-cut" : ""}`}
                    title={title}
                    aria-label={title}
                  />
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {cells.length === 0 ? <p className="heatmap-empty-note">{t("heatmap.empty")}</p> : null}
    </section>
  );
}

function cycleLabel(
  cycle: HeatmapCycle,
  t: ReturnType<typeof useLocale>["t"],
) {
  if (cycle.index === 0) return t("heatmap.cycle.current");
  return t("heatmap.cycle.previous", { index: cycle.index });
}

function isWeekCut(dayIndex: number) {
  return (dayIndex + 1) % 7 === 0;
}

function formatCalendarDay(day: string, locale: string) {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString(locale, {
    month: "2-digit",
    day: "2-digit",
  });
}

function formatCycleRange(startDay: string, endDay: string, locale: string) {
  return `${formatCalendarDay(startDay, locale)} - ${formatCalendarDay(endDay, locale)}`;
}

function cycleCardClassName(
  cycleId: string,
  draggingId: string | null,
  dropTargetId: string | null,
) {
  let className = "heatmap-cycle-card";
  if (draggingId === cycleId) {
    className += " dragging";
  }
  if (dropTargetId === cycleId) {
    className += " drop-target";
  }
  return className;
}
