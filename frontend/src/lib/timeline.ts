import type { TimelineBucket, TimelinePoint } from "./api";

export type TrendMetric = "tokens" | "cost" | "dual";

export function getPresetDateRange(
  preset: string | undefined,
  timezone: string | undefined,
): { since: string; until: string } | null {
  const tz = timezone || "UTC";
  const now = new Date();

  // Helper to format date in YYYY-MM-DD format for the given timezone
  const formatDate = (date: Date): string => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    return `${year}-${month}-${day}`;
  };

  switch (preset) {
    case "today": {
      const today = formatDate(now);
      return { since: today, until: today };
    }
    case "week": {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // Include today, so 6 days back
      return { since: formatDate(sevenDaysAgo), until: formatDate(now) };
    }
    case "recent30d": {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      return { since: formatDate(thirtyDaysAgo), until: formatDate(now) };
    }
    case "month": {
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: formatDate(firstDayOfMonth), until: formatDate(now) };
    }
    case "year": {
      const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
      return { since: formatDate(firstDayOfYear), until: formatDate(now) };
    }
    default:
      return null;
  }
}

export function fillTimelineGaps(
  data: TimelinePoint[],
  bucket: TimelineBucket,
  since: string | undefined,
  until: string | undefined,
  preset: string | undefined,
  timezone: string | undefined,
): TimelinePoint[] {
  // Compute effective date range from preset if since/until not explicitly set
  let effectiveSince = since;
  let effectiveUntil = until;

  if (!effectiveSince || !effectiveUntil) {
    const presetRange = getPresetDateRange(preset, timezone);
    if (presetRange) {
      effectiveSince = effectiveSince || presetRange.since;
      effectiveUntil = effectiveUntil || presetRange.until;
    }
  }

  if (!effectiveSince || !effectiveUntil) {
    // No date range available, return original data
    return data;
  }

  const bucketMs: Record<TimelineBucket, number> = {
    daily: 24 * 60 * 60 * 1000,
    hourly: 60 * 60 * 1000,
    minutely: 60 * 1000,
  };

  const step = bucketMs[bucket];

  // Build map of existing data points (using date string as key for daily, timestamp for finer granularity)
  const dataMap = new Map<number, TimelinePoint>();
  for (const item of data) {
    const itemTime = new Date(item.bucket_start).getTime();
    dataMap.set(itemTime, item);
  }

  // Parse start and end times
  const startTime = new Date(`${effectiveSince}T00:00:00`).getTime();
  const endTime = new Date(`${effectiveUntil}T23:59:59`).getTime();

  const result: TimelinePoint[] = [];
  let currentTime = startTime;

  while (currentTime <= endTime) {
    const existing = dataMap.get(currentTime);
    if (existing) {
      result.push(existing);
    } else {
      result.push({
        bucket_start: new Date(currentTime).toISOString(),
        bucket,
        total_tokens: 0,
        total_cost_usd: 0,
        event_count: 0,
        unique_models: 0,
        unique_sources: 0,
      });
    }
    currentTime += step;
  }

  return result;
}

export function formatBucketLabel(value: string, bucket: TimelineBucket, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  if (bucket === "daily") {
    return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }
  if (bucket === "hourly") {
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function computeTimelineAxisStep(
  length: number,
  width: number,
  bucket: TimelineBucket,
): number {
  const labelWidths: Record<TimelineBucket, number> = {
    daily: 56,
    hourly: 48,
    minutely: 64,
  };
  const maxLabels = Math.floor(width / (labelWidths[bucket] || 56));
  return Math.max(1, Math.ceil(length / maxLabels));
}

export function timelineLabel(
  bucket: TimelineBucket,
  t: (key: "trend.bucket.daily" | "trend.bucket.hourly" | "trend.bucket.minutely") => string,
) {
  if (bucket === "hourly") return t("trend.bucket.hourly");
  if (bucket === "minutely") return t("trend.bucket.minutely");
  return t("trend.bucket.daily");
}

export function timelineMetricLabel(
  metric: TrendMetric,
  t: (key: "trend.metric.tokens" | "trend.metric.cost" | "trend.metric.dual") => string,
) {
  if (metric === "cost") return t("trend.metric.cost");
  if (metric === "dual") return t("trend.metric.dual");
  return t("trend.metric.tokens");
}
