import { describe, expect, test } from "vitest";
import {
  formatCompactNumber,
  formatCompactUsd,
  formatDate,
  formatUsd,
  formatUsdPrecise,
  formatUsdValue,
} from "./format";

describe("formatCompactNumber", () => {
  test("formats small values as rounded integers", () => {
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(12.7)).toBe("13");
  });

  test("formats thousands and millions with suffixes", () => {
    expect(formatCompactNumber(1_000)).toBe("1.0K");
    expect(formatCompactNumber(15_320)).toBe("15.3K");
    expect(formatCompactNumber(2_500_000)).toBe("2.5M");
  });

  test("formats billions with suffixes", () => {
    expect(formatCompactNumber(1_200_000_000)).toBe("1.2B");
  });
});

describe("formatCompactUsd", () => {
  test("formats small and large costs", () => {
    expect(formatCompactUsd(12.34)).toBe("$12.34");
    expect(formatCompactUsd(1_234)).toBe("$1.2K");
    expect(formatCompactUsd(2_500_000)).toBe("$2.5M");
  });
});

describe("locale-aware formatters", () => {
  test("formats usd by locale", () => {
    expect(formatUsd(1234.5, "en")).toContain("$");
    expect(formatUsd(1234.5, "zh-CN").length).toBeGreaterThan(0);
  });

  test("formats usd value without a currency symbol", () => {
    expect(formatUsdValue(1234.5, "en")).toBe("1,234.50");
  });

  test("keeps precise usd values visible when needed", () => {
    expect(formatUsdPrecise(0.0001234, "en")).toBe("$0.000123");
    expect(formatUsdPrecise(12.3456, "en")).toBe("$12.3456");
  });

  test("returns fallback text when date is missing", () => {
    expect(formatDate(undefined, "en", "N/A")).toBe("N/A");
  });
});
