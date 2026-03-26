import { describe, expect, test } from "vitest";
import type { SourceStatus } from "./api";
import {
  buildSourceHealthGroups,
  defaultSourceHealthCollapse,
} from "./sourceHealth";

function source(partial: Partial<SourceStatus>): SourceStatus {
  return {
    source: partial.source ?? "codex",
    label: partial.label ?? "Codex",
    mode: partial.mode ?? "interactive",
    watched_paths: partial.watched_paths ?? [],
    discovered_artifacts: partial.discovered_artifacts ?? 0,
    imported_events: partial.imported_events ?? 0,
    last_scan_started_at: partial.last_scan_started_at,
    last_scan_completed_at: partial.last_scan_completed_at,
    last_duration_ms: partial.last_duration_ms,
    last_error: partial.last_error,
  };
}

describe("sourceHealth grouping", () => {
  test("splits rows into alerts, active, and empty groups", () => {
    const groups = buildSourceHealthGroups([
      source({ source: "claude", label: "Claude", last_error: "failed" }),
      source({ source: "codex", label: "Codex", imported_events: 15 }),
      source({ source: "cursor", label: "Cursor", discovered_artifacts: 2 }),
      source({ source: "gemini", label: "Gemini" }),
    ]);

    expect(groups.alerts).toHaveLength(1);
    expect(groups.active).toHaveLength(2);
    expect(groups.empty).toHaveLength(1);
    expect(groups.alerts[0].source).toBe("claude");
    expect(groups.empty[0].source).toBe("gemini");
  });

  test("sorts by events, then artifacts, then last scan", () => {
    const groups = buildSourceHealthGroups([
      source({
        source: "b",
        label: "Beta",
        imported_events: 10,
        discovered_artifacts: 1,
        last_scan_completed_at: "2026-03-21T08:00:00Z",
      }),
      source({
        source: "a",
        label: "Alpha",
        imported_events: 10,
        discovered_artifacts: 3,
        last_scan_completed_at: "2026-03-20T08:00:00Z",
      }),
      source({
        source: "c",
        label: "Gamma",
        imported_events: 8,
        discovered_artifacts: 99,
        last_scan_completed_at: "2026-03-22T08:00:00Z",
      }),
    ]);

    expect(groups.active.map((item) => item.source)).toEqual(["a", "b", "c"]);
  });

  test("opens empty group when only empty sources exist", () => {
    const onlyEmpty = buildSourceHealthGroups([source({ source: "x", label: "X" })]);
    const mixed = buildSourceHealthGroups([
      source({ source: "x", label: "X", imported_events: 1 }),
      source({ source: "y", label: "Y" }),
    ]);

    expect(defaultSourceHealthCollapse(onlyEmpty).empty).toBe(false);
    expect(defaultSourceHealthCollapse(mixed).empty).toBe(true);
  });
});
