import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
import type { BreakdownRow } from "../lib/api";
import { formatNumber, formatUsd } from "../lib/format";
import { useLocale } from "../lib/i18n";

type BreakdownTableProps = {
  rows: BreakdownRow[];
};

const helper = createColumnHelper<BreakdownRow>();

export default function BreakdownTable({ rows }: BreakdownTableProps) {
  const { locale, t } = useLocale();
  const columns = useMemo(
    () => [
      helper.accessor("label", {
        header: t("table.dimension"),
        cell: (info) => <strong>{info.getValue()}</strong>,
      }),
      helper.accessor("event_count", {
        header: t("table.events"),
      }),
      helper.accessor("total_tokens", {
        header: t("table.tokens"),
        cell: (info) => formatNumber(info.getValue()),
      }),
      helper.accessor("total_cost_usd", {
        header: t("table.cost"),
        cell: (info) => formatUsd(info.getValue(), locale),
      }),
      helper.accessor("reasoning_tokens", {
        header: t("table.reasoning"),
        cell: (info) => formatNumber(info.getValue()),
      }),
    ],
    [locale, t],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="table-wrap">
      <table>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id}>
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
                <td key={cell.id}>
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
