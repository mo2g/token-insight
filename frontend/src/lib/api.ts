export type UsageFilter = {
  sources: string[];
  providers: string[];
  models: string[];
  modelFamilies: string[];
  projects: string[];
  since?: string;
  until?: string;
  preset?: string;
  mode?: string;
  minTokens?: number;
  maxTokens?: number;
  minCost?: number;
  maxCost?: number;
  search?: string;
  groupBy?: string;
  sort?: string;
  timezone?: string;
  excludeArchived?: boolean;
};

export type OverviewStats = {
  total_tokens: number;
  total_cost_usd: number;
  prompt_tokens: number;
  completion_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  tool_tokens: number;
  event_count: number;
  active_days: number;
  streak_days: number;
  top_source?: string;
  top_model?: string;
  last_event_at?: string;
  last_refresh_at?: string;
};

export type BreakdownRow = {
  key: string;
  label: string;
  source?: string;
  provider?: string;
  model?: string;
  model_family?: string;
  project?: string;
  event_count: number;
  total_tokens: number;
  total_cost_usd: number;
  prompt_tokens: number;
  completion_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
};

export type DailyPoint = {
  day: string;
  total_tokens: number;
  total_cost_usd: number;
  event_count: number;
  unique_models: number;
  unique_sources: number;
};

export type TimelineBucket = "daily" | "hourly" | "minutely";

export type TimelinePoint = {
  bucket_start: string;
  bucket: TimelineBucket;
  total_tokens: number;
  total_cost_usd: number;
  event_count: number;
  unique_models: number;
  unique_sources: number;
};

export type ContributionCell = {
  day: string;
  week_index: number;
  weekday: number;
  total_tokens: number;
  total_cost_usd: number;
  intensity: number;
};

export type FilterOptions = {
  sources: string[];
  providers: string[];
  models: string[];
  model_families: string[];
  projects: string[];
  min_day?: string;
  max_day?: string;
};

export type SourceStatus = {
  source: string;
  label: string;
  mode: string;
  watched_paths: string[];
  discovered_artifacts: number;
  imported_events: number;
  last_scan_started_at?: string;
  last_scan_completed_at?: string;
  last_duration_ms?: number;
  last_error?: string;
};

export type RefreshEvent = {
  kind: string;
  summary: {
    mode: string;
    scanned_sources: number;
    discovered_artifacts: number;
    imported_events: number;
    skipped_artifacts: number;
    started_at: string;
    completed_at: string;
    duration_ms: number;
  };
};

export type SocialPreset = "summary" | "wrapped" | "command-deck" | "signal-grid";

export function filterToQuery(filter: UsageFilter) {
  const params = new URLSearchParams();
  const setList = (key: string, values: string[]) => {
    if (values.length > 0) {
      params.set(key, values.join(","));
    }
  };

  setList("sources", filter.sources);
  setList("providers", filter.providers);
  setList("models", filter.models);
  setList("model_families", filter.modelFamilies);
  setList("projects", filter.projects);
  if (filter.since) params.set("since", filter.since);
  if (filter.until) params.set("until", filter.until);
  if (filter.preset) params.set("preset", filter.preset);
  if (filter.mode) params.set("mode", filter.mode);
  if (typeof filter.minTokens === "number") params.set("min_tokens", String(filter.minTokens));
  if (typeof filter.maxTokens === "number") params.set("max_tokens", String(filter.maxTokens));
  if (typeof filter.minCost === "number") params.set("min_cost", String(filter.minCost));
  if (typeof filter.maxCost === "number") params.set("max_cost", String(filter.maxCost));
  if (filter.search) params.set("search", filter.search);
  if (filter.groupBy) params.set("group_by", filter.groupBy);
  if (filter.sort) params.set("sort", filter.sort);
  if (filter.timezone) params.set("timezone", filter.timezone);
  if (filter.excludeArchived) params.set("exclude_archived", "true");
  return params;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function fetchOverview(filter: UsageFilter) {
  return request<OverviewStats>(`/api/overview?${filterToQuery(filter).toString()}`);
}

export function fetchModelsBreakdown(filter: UsageFilter) {
  return request<BreakdownRow[]>(
    `/api/breakdowns/models?${filterToQuery(filter).toString()}`,
  );
}

export function fetchSourcesBreakdown(filter: UsageFilter) {
  return request<BreakdownRow[]>(
    `/api/breakdowns/sources?${filterToQuery(filter).toString()}`,
  );
}

export function fetchTimeline(filter: UsageFilter, bucket: TimelineBucket) {
  return request<TimelinePoint[]>(
    `/api/timeline/${bucket}?${filterToQuery(filter).toString()}`,
  );
}

export function fetchContributions(filter: UsageFilter) {
  return request<ContributionCell[]>(
    `/api/contributions?${filterToQuery(filter).toString()}`,
  );
}

export function fetchFilterOptions() {
  return request<FilterOptions>("/api/filters/options");
}

export function fetchSources() {
  return request<SourceStatus[]>("/api/sources");
}

export async function refreshData() {
  return request<{ duration_ms: number }>("/api/refresh", { method: "POST" });
}

export async function renderSocialImage(preset: SocialPreset, filter: UsageFilter) {
  const response = await fetch("/api/social-images/render", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ preset, filter }),
  });
  if (!response.ok) {
    throw new Error(`Render failed: ${response.status}`);
  }
  return response.blob();
}
