import { describe, expect, it } from "vitest";
import { pairIsBlocked } from "./blocking";

describe("pairIsBlocked", () => {
  it("blocks a pair when either participant created the block", () => {
    expect(pairIsBlocked([{ blockerId: 10, blockedId: 20 }], 10, 20)).toBe(true);
    expect(pairIsBlocked([{ blockerId: 10, blockedId: 20 }], 20, 10)).toBe(true);
  });

  it("does not affect unrelated participants or a user's own account", () => {
    const rows = [{ blockerId: 10, blockedId: 20 }];
    expect(pairIsBlocked(rows, 10, 30)).toBe(false);
    expect(pairIsBlocked(rows, 10, 10)).toBe(false);
    expect(pairIsBlocked([], 10, 20)).toBe(false);
  });
});
