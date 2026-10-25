import { describe, expect, it } from "vitest";

import {
  countGroupedNumberCharacters,
  formatGroupedNumber,
  getGroupedNumberCaret,
  parseGroupedNumber,
} from "./number-input";

describe("localized number input", () => {
  it.each([
    ["1000", "1.000"],
    ["10000", "10.000"],
    ["1000000", "1.000.000"],
    ["4200000000", "4.200.000.000"],
  ])("formats %s with period thousands separators", (value, expected) => {
    expect(formatGroupedNumber(value)).toBe(expected);
    expect(parseGroupedNumber(expected)).toBe(value);
  });

  it("uses a comma for decimals and preserves trailing decimal input", () => {
    expect(formatGroupedNumber("1234.5")).toBe("1.234,5");
    expect(formatGroupedNumber("1234.50")).toBe("1.234,50");
    expect(formatGroupedNumber("1234.")).toBe("1.234,");
    expect(parseGroupedNumber("1.234,50")).toBe("1234.50");
    expect(parseGroupedNumber("1.234,")).toBe("1234.");
  });

  it("does not allow decimal separators in integer-only fields", () => {
    expect(formatGroupedNumber("10000", false)).toBe("10.000");
    expect(parseGroupedNumber("10.000", false)).toBe("10000");
    expect(parseGroupedNumber("10,5", false)).toBe("10");
  });

  it("keeps the caret aligned with digits when thousands dots are inserted", () => {
    expect(countGroupedNumberCharacters("42.000")).toBe(5);
    expect(getGroupedNumberCaret("42.000", 2)).toBe(2);
    expect(getGroupedNumberCaret("4.200.000", 3)).toBe(4);
  });
});
