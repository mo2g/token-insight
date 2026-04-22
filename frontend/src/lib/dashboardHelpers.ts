import type { BreakdownRow, UsageFilter } from "./api";
import type { LayoutItem } from "react-grid-layout";

export function buildTokenModelOptions(rows: BreakdownRow[], selectedModels: string[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const model = (row.model ?? row.label).trim();
    if (!model) continue;
    totals.set(model, (totals.get(model) ?? 0) + (row.total_tokens ?? 0));
  }

  const selectedSet = new Set(selectedModels);
  const selectedOptions = Array.from(selectedSet)
    .filter((m) => totals.has(m))
    .map((model) => ({
      value: model,
      label: model,
      tokens: totals.get(model) ?? 0,
    }));

  const otherOptions = Array.from(totals.entries())
    .filter(([model]) => !selectedSet.has(model))
    .map(([model, tokens]) => ({
      value: model,
      label: model,
      tokens,
    }));

  otherOptions.sort((a, b) => b.tokens - a.tokens);

  return [...selectedOptions, ...otherOptions].map((opt) => {
    const idx = opt.label.lastIndexOf("/");
    const shortLabel = idx > 0 ? opt.label.slice(idx + 1) : opt.label;
    return {
      ...opt,
      label: shortLabel || opt.label,
    };
  });
}

export function countActiveFilters(filter: UsageFilter): number {
  let count = 0;
  count += filter.sources.length;
  count += filter.providers.length;
  count += filter.models.length;
  count += filter.modelFamilies.length;
  count += filter.projects.length;
  if (filter.since) count += 1;
  if (filter.until) count += 1;
  if (filter.mode) count += 1;
  if (typeof filter.minTokens === "number") count += 1;
  if (typeof filter.maxTokens === "number") count += 1;
  if (typeof filter.minCost === "number") count += 1;
  if (typeof filter.maxCost === "number") count += 1;
  if (filter.search) count += 1;
  if (filter.excludeArchived) count += 1;
  return count;
}

export function isSameLayout(left: LayoutItem[], right: LayoutItem[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    if (
      a.i !== b.i ||
      a.x !== b.x ||
      a.y !== b.y ||
      a.w !== b.w ||
      a.h !== b.h
    ) {
      return false;
    }
  }
  return true;
}
