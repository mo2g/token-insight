import { describe, expect, test } from "vitest";
import { filterToQuery } from "./api";
import { parseFilter } from "./filters";

describe("filter serialization", () => {
  test("round trips arrays and scalars", () => {
    const params = new URLSearchParams(
      filterToQuery({
        sources: ["claude", "codex"],
        providers: ["anthropic"],
        models: ["claude-sonnet-4-5"],
        modelFamilies: ["claude-sonnet"],
        projects: ["/tmp/demo"],
        preset: "recent30d",
        sort: "cost:desc",
        timezone: "Asia/Shanghai",
        excludeArchived: true,
      }),
    );
    const filter = parseFilter(params);
    expect(filter.sources).toEqual(["claude", "codex"]);
    expect(filter.providers).toEqual(["anthropic"]);
    expect(filter.models).toEqual(["claude-sonnet-4-5"]);
    expect(filter.modelFamilies).toEqual(["claude-sonnet"]);
    expect(filter.projects).toEqual(["/tmp/demo"]);
    expect(filter.preset).toBe("recent30d");
    expect(filter.sort).toBe("cost:desc");
    expect(filter.timezone).toBe("Asia/Shanghai");
    expect(filter.excludeArchived).toBe(true);
  });

  test("defaults to recent30d when preset is absent", () => {
    expect(parseFilter(new URLSearchParams()).preset).toBe("recent30d");
  });

  test("preserves legacy month preset values", () => {
    expect(parseFilter(new URLSearchParams("preset=month")).preset).toBe("month");
  });
});
