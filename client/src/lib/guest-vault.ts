import type { FacilityType, ItemCategory } from "@/lib/return";
import { MAX_GUEST_VAULT_PAYLOAD_CHARS } from "../../../shared/guest-sync";

const CODE_PREFIX = "RETURN-GUEST-V1";
export const GUEST_CODE_STORAGE_KEY = "return.guest-sync-code.v1";

export type GuestSavedSearch = {
  id: string;
  label: string;
  query: string;
  category: ItemCategory | null;
  facilityType: FacilityType | null;
  route: string | null;
  updatedAt: string;
};

export type GuestTracking = {
  id: string;
  title: string;
  category: ItemCategory;
  details: string;
  lostAt: string | null;
  location: string;
  route: string | null;
  isActive: boolean;
  updatedAt: string;
};

export type GuestVaultData = {
  version: 1;
  savedSearches: GuestSavedSearch[];
  tracking: GuestTracking[];
};

export type ParsedGuestCode = { accessKey: string; encryptionKey: Uint8Array };

const EMPTY_VAULT: GuestVaultData = { version: 1, savedSearches: [], tracking: [] };

export class GuestVaultTooLargeError extends Error {
  constructor() {
    super("共有ボックスの内容が上限を超えています。不要な条件を削除してから再度お試しください。");
    this.name = "GuestVaultTooLargeError";
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("共有コードの形式が正しくありません。");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export function createGuestShareCode() {
  return `${CODE_PREFIX}.${randomKey()}.${randomKey()}`;
}

export function parseGuestShareCode(value: string): ParsedGuestCode {
  const match = value.trim().match(/^RETURN-GUEST-V1\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/);
  if (!match) throw new Error("共有コードは省略せず、RETURN-GUEST-V1. から最後まで入力してください。");
  const encryptionKey = base64UrlToBytes(match[2]);
  if (base64UrlToBytes(match[1]).length !== 32 || encryptionKey.length !== 32) throw new Error("共有コードが破損しています。");
  return { accessKey: match[1], encryptionKey };
}

function normalizeVaultData(value: unknown): GuestVaultData {
  if (!value || typeof value !== "object") return { ...EMPTY_VAULT };
  const candidate = value as Partial<GuestVaultData>;
  if (candidate.version !== 1) throw new Error("この共有ボックスのバージョンには対応していません。");
  const savedSearches = Array.isArray(candidate.savedSearches) ? candidate.savedSearches.slice(0, 40).filter(item =>
    item && typeof item.id === "string" && typeof item.label === "string" && typeof item.query === "string" &&
    (item.category === null || typeof item.category === "string") && (item.facilityType === null || typeof item.facilityType === "string") &&
    (item.route === null || typeof item.route === "string") && typeof item.updatedAt === "string",
  ).map(item => ({
    id: item.id.slice(0, 64), label: item.label.slice(0, 80), query: item.query.slice(0, 200),
    category: item.category as ItemCategory | null, facilityType: item.facilityType as FacilityType | null,
    route: item.route?.slice(0, 200) ?? null, updatedAt: item.updatedAt.slice(0, 40),
  })) : [];
  const tracking = Array.isArray(candidate.tracking) ? candidate.tracking.slice(0, 40).filter(item =>
    item && typeof item.id === "string" && typeof item.title === "string" && typeof item.category === "string" &&
    typeof item.details === "string" && (item.lostAt === null || typeof item.lostAt === "string") &&
    typeof item.location === "string" && (item.route === null || typeof item.route === "string") &&
    typeof item.isActive === "boolean" && typeof item.updatedAt === "string",
  ).map(item => ({
    id: item.id.slice(0, 64), title: item.title.slice(0, 160), category: item.category as ItemCategory,
    details: item.details.slice(0, 1200), lostAt: item.lostAt?.slice(0, 40) ?? null,
    location: item.location.slice(0, 200), route: item.route?.slice(0, 200) ?? null,
    isActive: item.isActive, updatedAt: item.updatedAt.slice(0, 40),
  })) : [];
  return { version: 1, savedSearches, tracking };
}

export function emptyGuestVault(): GuestVaultData {
  return { ...EMPTY_VAULT, savedSearches: [], tracking: [] };
}

export async function encryptGuestVault(data: GuestVaultData, code: string) {
  const { encryptionKey } = parseGuestShareCode(code);
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(encryptionKey), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(normalizeVaultData(data)));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const payload = `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
  if (payload.length > MAX_GUEST_VAULT_PAYLOAD_CHARS) throw new GuestVaultTooLargeError();
  return payload;
}

export async function decryptGuestVault(encryptedPayload: string, code: string): Promise<GuestVaultData> {
  const { encryptionKey } = parseGuestShareCode(code);
  const match = encryptedPayload.match(/^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)$/);
  if (!match) throw new Error("共有ボックスの暗号文が壊れています。");
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(encryptionKey), { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(match[1]) }, key, base64UrlToBytes(match[2]));
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  return normalizeVaultData(parsed);
}
