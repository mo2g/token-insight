import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BreakdownRow } from "../lib/api";
import { formatNumber, formatUsd, formatUsdPrecise, formatUsdValue } from "../lib/format";
import { useLocale } from "../lib/i18n";

type BreakdownTableProps = {
  rows: BreakdownRow[];
  variant?: "auto" | "mini";
  mode?: "default" | "ranking";
};

const helper = createColumnHelper<BreakdownRow>();
const FULL_TABLE_MIN_WIDTH = 720;
type TableDensity = "full" | "compact" | "mini";

export default function BreakdownTable({
  rows,
  variant = "auto",
  mode = "default",
}: BreakdownTableProps) {
  const { locale, t } = useLocale();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(960);
  const density = variant === "mini" ? "mini" : densityFromWidth(width, mode);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    setWidth(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const next = entries.at(0)?.contentRect.width;
      if (next && next > 0) {
        setWidth(next);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columns = useMemo(
    () => buildColumns(density, locale, t, mode),
    [density, locale, mode, t],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div
      ref={wrapRef}
      className={mode === "ranking" ? `table-wrap no-scroll density-${density}` : `table-wrap density-${density}`}
    >
      <table className={`breakdown-table density-${density}`}>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id} className={headerClass(header.id)}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className={cellClass(cell.column.id)}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function densityFromWidth(width: number, mode: BreakdownTableProps["mode"]): TableDensity {
  if (mode === "ranking") {
    if (width < 420) return "mini";
    if (width < 640) return "compact";
    return "full";
  }
  if (width < FULL_TABLE_MIN_WIDTH) return "compact";
  return "full";
}

function buildColumns(
  density: TableDensity,
  locale: ReturnType<typeof useLocale>["locale"],
  t: ReturnType<typeof useLocale>["t"],
  mode: BreakdownTableProps["mode"],
) {
  if (mode === "ranking") {
    return [
      helper.accessor("label", {
        header: t("table.dimension"),
        cell: (info) => (
          <span className="table-label-stack">
            <strong>{info.getValue()}</strong>
            <em>{t("table.events")} {formatNumber(info.row.original.event_count)}</em>
          </span>
        ),
      }),
      helper.accessor("total_tokens", {
        header: t("table.tokens"),
        cell: (info) => formatNumber(info.getValue()),
      }),
      helper.accessor("total_cost_usd", {
        header: t("table.cost"),
        cell: (info) => (
          <CostCell
            totalCostUsd={info.getValue()}
            totalTokens={info.row.original.total_tokens}
            locale={locale}
            t={t}
            tooltipId={`cost-tooltip-${info.row.id}`}
          />
        ),
      }),
    ];
  }

  const compactColumns = [
    helper.accessor("label", {
      header: t("table.dimension"),
      cell: (info) => <strong>{info.getValue()}</strong>,
    }),
    helper.accessor("event_count", {
      header: t("table.events"),
      cell: (info) => formatNumber(info.getValue()),
    }),
    helper.accessor("total_tokens", {
      header: t("table.tokens"),
      cell: (info) => formatNumber(info.getValue()),
    }),
    helper.accessor("total_cost_usd", {
      header: t("table.cost"),
      cell: (info) => formatUsdValue(info.getValue(), locale),
    }),
  ];

  if (density === "mini") {
    return compactColumns.slice(0, 3);
  }

  if (density === "full") {
    return [...compactColumns, helper.accessor("reasoning_tokens", {
      header: t("table.reasoning"),
      cell: (info) => formatNumber(info.getValue()),
    })];
  }

  return compactColumns;
}

function headerClass(columnId: string) {
  if (columnId === "label") return "table-header-label";
  return "table-header-number";
}

function cellClass(columnId: string) {
  if (columnId === "label") return "table-cell-label";
  return "table-cell-number";
}

type CostCellProps = {
  totalCostUsd: number;
  totalTokens: number;
  locale: ReturnType<typeof useLocale>["locale"];
  t: ReturnType<typeof useLocale>["t"];
  tooltipId: string;
};

function CostCell({ totalCostUsd, totalTokens, locale, t, tooltipId }: CostCellProps) {
  const averagePerMillionText =
    totalTokens > 0
      ? formatUsdPrecise((totalCostUsd / totalTokens) * 1_000_000, locale)
      : t("common.na");
  const tooltipText = t("table.costPerMillion", { value: averagePerMillionText });

  return (
    <span className="cost-cell">
      <span className="cost-cell-value">{formatUsdValue(totalCostUsd, locale)}</span>
      <span className="cost-cell-info">
        <button
          type="button"
          className="cost-cell-badge"
          aria-describedby={tooltipId}
        >
          1M
        </button>
        <span id={tooltipId} className="cost-cell-tooltip" role="tooltip">
          {tooltipText}
        </span>
      </span>
    </span>
  );
}
