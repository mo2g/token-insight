import type { SourceStatus } from "./api";

export type SourceHealthGroupId = "alerts" | "active" | "empty";

export type SourceHealthGroups = Record<SourceHealthGroupId, SourceStatus[]>;

export type SourceHealthCollapseState = Record<SourceHealthGroupId, boolean>;

export function buildSourceHealthGroups(items: SourceStatus[]): SourceHealthGroups {
  const sorted = [...items].sort(compareSourceStatus);
  return {
    alerts: sorted.filter((item) => Boolean(item.last_error)),
    active: sorted.filter((item) => !item.last_error && hasData(item)),
    empty: sorted.filter((item) => !item.last_error && !hasData(item)),
  };
}

export function defaultSourceHealthCollapse(
  groups: SourceHealthGroups,
): SourceHealthCollapseState {
  const onlyEmpty = groups.alerts.length === 0 && groups.active.length === 0 && groups.empty.length > 0;
  return {
    alerts: false,
    active: false,
    empty: onlyEmpty ? false : true,
  };
}

function hasData(item: SourceStatus): boolean {
  return item.imported_events > 0 || item.discovered_artifacts > 0;
}

function compareSourceStatus(left: SourceStatus, right: SourceStatus) {
  if (right.imported_events !== left.imported_events) {
    return right.imported_events - left.imported_events;
  }
  if (right.discovered_artifacts !== left.discovered_artifacts) {
    return right.discovered_artifacts - left.discovered_artifacts;
  }
  const rightScan = parseTime(right.last_scan_completed_at);
  const leftScan = parseTime(left.last_scan_completed_at);
  if (rightScan !== leftScan) {
    return rightScan - leftScan;
  }
  return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
}

function parseTime(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
