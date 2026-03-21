import type { ContributionCell } from "../lib/api";
import { formatNumber } from "../lib/format";
import { useLocale } from "../lib/i18n";

type ContributionHeatmapProps = {
  cells: ContributionCell[];
};

export default function ContributionHeatmap({ cells }: ContributionHeatmapProps) {
  const { t } = useLocale();

  if (cells.length === 0) {
    return <div className="empty-state">{t("heatmap.empty")}</div>;
  }

  return (
    <div className="heatmap-grid" aria-label={t("heatmap.aria")}>
      {cells.slice(-84).map((cell) => (
        <div
          key={cell.day}
          className="heat-cell"
          style={{ opacity: Math.max(cell.intensity, 0.08) }}
          title={t("heatmap.cellTitle", {
            day: cell.day,
            tokens: formatNumber(cell.total_tokens),
          })}
        />
      ))}
    </div>
  );
}
