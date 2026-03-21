import { type UsageFilter } from "./api";

export const defaultFilter: UsageFilter = {
  sources: [],
  providers: [],
  models: [],
  modelFamilies: [],
  projects: [],
  preset: "month",
  sort: "tokens:desc",
  timezone: detectTimezone(),
  excludeArchived: false,
};

export function parseFilter(searchParams: URLSearchParams): UsageFilter {
  return {
    sources: parseList(searchParams.get("sources")),
    providers: parseList(searchParams.get("providers")),
    models: parseList(searchParams.get("models")),
    modelFamilies: parseList(searchParams.get("model_families")),
    projects: parseList(searchParams.get("projects")),
    since: searchParams.get("since") ?? undefined,
    until: searchParams.get("until") ?? undefined,
    preset: searchParams.get("preset") ?? defaultFilter.preset,
    mode: searchParams.get("mode") ?? undefined,
    minTokens: parseNumber(searchParams.get("min_tokens")),
    maxTokens: parseNumber(searchParams.get("max_tokens")),
    minCost: parseNumber(searchParams.get("min_cost")),
    maxCost: parseNumber(searchParams.get("max_cost")),
    search: searchParams.get("search") ?? undefined,
    groupBy: searchParams.get("group_by") ?? undefined,
    sort: searchParams.get("sort") ?? defaultFilter.sort,
    timezone: searchParams.get("timezone") ?? defaultFilter.timezone,
    excludeArchived:
      searchParams.get("exclude_archived") === "true" ? true : defaultFilter.excludeArchived,
  };
}

export function parseList(value: string | null) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
}

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function mergeFilter(filter: UsageFilter, patch: Partial<UsageFilter>): UsageFilter {
  return {
    ...filter,
    ...patch,
  };
}

function detectTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
