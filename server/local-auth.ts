import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLELISM });
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELISM}$${salt}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, salt, encoded] = stored.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !salt || !encoded) return false;
  try {
    const expected = Buffer.from(encoded, "hex");
    const actual = scryptSync(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
