import { describe, expect, it } from "vitest";
import {
  createGuestShareCode,
  decryptGuestVault,
  emptyGuestVault,
  encryptGuestVault,
  parseGuestShareCode,
} from "../client/src/lib/guest-vault";
import { MAX_GUEST_VAULT_PAYLOAD_CHARS } from "../shared/guest-sync";

describe("guest vault encryption", () => {
  it("creates a high-entropy code and encrypts/decrypts data without exposing plaintext", async () => {
    const code = createGuestShareCode();
    const parsed = parseGuestShareCode(code);
    expect(parsed.accessKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(parsed.encryptionKey).toHaveLength(32);

    const vault = {
      ...emptyGuestVault(),
      savedSearches: [{
        id: "search-1", label: "青い傘", query: "青い傘", category: "daily" as const,
        facilityType: "rail" as const, route: "中央線", updatedAt: "2026-11-01T00:00:00.000Z",
      }],
    };
    const ciphertext = await encryptGuestVault(vault, code);
    expect(ciphertext).toMatch(/^v1\./);
    expect(ciphertext).not.toContain("青い傘");
    expect(await decryptGuestVault(ciphertext, code)).toEqual(vault);
  });

  it("rejects malformed codes, wrong keys, and tampered ciphertext", async () => {
    const code = createGuestShareCode();
    expect(() => parseGuestShareCode("not-a-code")).toThrow();
    const encrypted = await encryptGuestVault(emptyGuestVault(), code);
    const otherCode = createGuestShareCode();
    await expect(decryptGuestVault(encrypted, otherCode)).rejects.toThrow();
    const parts = encrypted.split(".");
    const ciphertext = parts[2]!;
    const index = Math.floor(ciphertext.length / 2);
    const replacement = ciphertext[index] === "A" ? "B" : "A";
    parts[2] = ciphertext.slice(0, index) + replacement + ciphertext.slice(index + 1);
    await expect(decryptGuestVault(parts.join("."), code)).rejects.toThrow();
  });

  it("fits the advertised 40-item and maximum-field limits within the shared payload cap", async () => {
    const code = createGuestShareCode();
    const updatedAt = "2026-11-01T00:00:00.000Z";
    const vault = {
      version: 1 as const,
      savedSearches: Array.from({ length: 40 }, (_, index) => ({
        id: `search-${String(index).padStart(32, "0")}`,
        label: "あ".repeat(80),
        query: "あ".repeat(200),
        category: "other" as const,
        facilityType: "other" as const,
        route: "あ".repeat(200),
        updatedAt,
      })),
      tracking: Array.from({ length: 40 }, (_, index) => ({
        id: `tracking-${String(index).padStart(32, "0")}`,
        title: "あ".repeat(160),
        category: "other" as const,
        details: "あ".repeat(1200),
        lostAt: updatedAt,
        location: "あ".repeat(200),
        route: "あ".repeat(200),
        isActive: true,
        updatedAt,
      })),
    };

    const payload = await encryptGuestVault(vault, code);
    expect(payload.length).toBeLessThanOrEqual(MAX_GUEST_VAULT_PAYLOAD_CHARS);
  });
});
