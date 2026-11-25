import { describe, expect, it } from "vitest";
import { findSensitiveInformation, redactSensitiveInformation } from "./privacy";
import { publicFoundPost, type FoundPost } from "./return-utils";

const now = new Date("2026-10-31T00:00:00.000Z");

function samplePost(overrides: Partial<FoundPost> = {}): FoundPost {
  return {
    id: 42,
    ownerId: 7311,
    title: "黒い財布",
    category: "wallet",
    facilityType: "community",
    color: "黒",
    shape: "二つ折り",
    description: "東京都渋谷区神宮前1-2-3。電話: 090-1234-5678",
    foundAt: now,
    storageUntil: null,
    placeLabel: "東京都渋谷区神宮前1-2-3",
    deliveredTo: "駅係員窓口",
    latitude: 35.681234,
    longitude: 139.767891,
    imageUrl: "/manus-storage/return/7311/Abc_12345678.jpg",
    photoConsentAt: now,
    privateClues: "所有者だけに伝える非公開の確認用特徴です",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as FoundPost;
}

describe("privacy filters", () => {
  it("detects common Japanese addresses, contact information, payment numbers, and SNS IDs", () => {
    expect(findSensitiveInformation("東京都渋谷区神宮前1-2-3")).toContain("詳細住所");
    expect(findSensitiveInformation("港区芝公園4丁目2番8号")).toContain("詳細住所");
    expect(findSensitiveInformation("〒150-0001")).toContain("郵便番号");
    expect(findSensitiveInformation("電話 090-1234-5678")).toContain("電話番号");
    expect(findSensitiveInformation("カード 4111 1111 1111 1111")).toContain("長い番号/カード番号");
    expect(findSensitiveInformation("LINE ID: satoken123")).toContain("SNSアカウントID");
    expect(findSensitiveInformation("山田太郎さんから預かった品")).toContain("氏名らしき表記");
  });

  it("does not mistake a station platform or an address-book item for a street address", () => {
    expect(findSensitiveInformation("1番線の案内板を確認してください")).toEqual([]);
    expect(findSensitiveInformation("住所録の青いノート")).toEqual([]);
    expect(findSensitiveInformation("駅係員窓口 12番")).toEqual([]);
    expect(findSensitiveInformation("新宿駅前1丁目の広いエリア")).toEqual([]);
    expect(findSensitiveInformation("黒い財布を2026-10-31に落とした")).toEqual([]);
    expect(redactSensitiveInformation("黒い財布を2026-10-31に落とした")).toContain("2026-10-31");
  });

  it("removes a complete Japanese locality and street-number sequence before AI transmission", () => {
    const safe = redactSensitiveInformation("東京都渋谷区神宮前1-2-3の黒い財布、090-1234-5678、LINE ID: satoken123");
    expect(safe).not.toContain("東京都");
    expect(safe).not.toContain("神宮前");
    expect(safe).not.toContain("1-2-3");
    expect(safe).not.toContain("090-1234-5678");
    expect(safe).not.toContain("satoken123");
    expect(safe).toContain("[住所省略]");
    expect(redactSensitiveInformation("山田太郎さんの黒い財布")).not.toContain("山田太郎");
  });

  it("returns only public text and a post-scoped image route, never owner storage identifiers", () => {
    const result = publicFoundPost(samplePost());
    expect(result.title).toBe("黒い財布");
    expect(result.description).not.toContain("東京都");
    expect(result.description).not.toContain("090-1234-5678");
    expect(result.placeLabel).not.toContain("神宮前");
    expect(result.imageUrl).toBe("/api/public/found-photo/42");
    expect(result.latitude).toBe(35.68);
    expect(result.longitude).toBe(139.77);
    expect(result).not.toHaveProperty("ownerId");
    expect(result).not.toHaveProperty("privateClues");
    expect(result).not.toHaveProperty("photoConsentAt");
    expect(JSON.stringify(result)).not.toContain("7311");
  });
});
