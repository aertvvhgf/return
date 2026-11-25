import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { guestSyncVaults } from "../../drizzle/schema";
import { publicProcedure, router } from "../_core/trpc";
import { requireDatabase } from "../return-utils";
import { MAX_GUEST_VAULT_PAYLOAD_CHARS } from "../../shared/guest-sync";

const ACCESS_KEY = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "共有コードを確認してください。");
const ENCRYPTED_PAYLOAD = z.string().min(30).max(MAX_GUEST_VAULT_PAYLOAD_CHARS).regex(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/, "暗号化データの形式が正しくありません。");
const VAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const EXPIRY_REFRESH_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

export function hashGuestAccessKey(accessKey: string) {
  return createHash("sha256").update(accessKey, "utf8").digest("hex");
}

function expiryFromNow() {
  return new Date(Date.now() + VAULT_TTL_MS);
}

async function readRow(db: Awaited<ReturnType<typeof requireDatabase>>, accessKeyHash: string) {
  const rows = await db.select().from(guestSyncVaults).where(eq(guestSyncVaults.accessKeyHash, accessKeyHash)).limit(1);
  return rows[0] ?? null;
}

function publicState(row: NonNullable<Awaited<ReturnType<typeof readRow>>>) {
  if (row.status !== "active") return { status: row.status as "revoked" | "expired", revision: row.revision, encryptedPayload: null, expiresAt: row.expiresAt };
  return { status: "active" as const, revision: row.revision, encryptedPayload: row.encryptedPayload, expiresAt: row.expiresAt };
}

export const guestSyncRouter = router({
  load: publicProcedure.input(z.object({ accessKey: ACCESS_KEY })).mutation(async ({ input }) => {
    const db = await requireDatabase();
    const keyHash = hashGuestAccessKey(input.accessKey);
    const row = await readRow(db, keyHash);
    if (!row) return { status: "missing" as const, revision: null, encryptedPayload: null, expiresAt: null };

    const now = Date.now();
    if (row.status === "active" && row.expiresAt.getTime() <= now) {
      await db.update(guestSyncVaults).set({ status: "expired", encryptedPayload: "" })
        .where(and(eq(guestSyncVaults.accessKeyHash, keyHash), eq(guestSyncVaults.status, "active")));
      return { status: "expired" as const, revision: row.revision, encryptedPayload: null, expiresAt: row.expiresAt };
    }
    if (row.status === "active" && row.expiresAt.getTime() < now + EXPIRY_REFRESH_WINDOW_MS) {
      const refreshed = expiryFromNow();
      await db.update(guestSyncVaults).set({ expiresAt: refreshed })
        .where(and(eq(guestSyncVaults.accessKeyHash, keyHash), eq(guestSyncVaults.status, "active"), gt(guestSyncVaults.expiresAt, new Date(now))));
      return { ...publicState(row), expiresAt: refreshed };
    }
    return publicState(row);
  }),

  save: publicProcedure.input(z.object({
    accessKey: ACCESS_KEY,
    expectedRevision: z.number().int().min(1).nullable(),
    encryptedPayload: ENCRYPTED_PAYLOAD,
  })).mutation(async ({ input }) => {
    const db = await requireDatabase();
    const keyHash = hashGuestAccessKey(input.accessKey);
    const now = new Date();
    const current = await readRow(db, keyHash);

    if (current?.status === "revoked" || current?.status === "expired") return { status: current.status as "revoked" | "expired", revision: current.revision };
    if (current && current.expiresAt.getTime() <= now.getTime()) {
      await db.update(guestSyncVaults).set({ status: "expired", encryptedPayload: "" })
        .where(and(eq(guestSyncVaults.accessKeyHash, keyHash), eq(guestSyncVaults.status, "active")));
      return { status: "expired" as const, revision: current.revision };
    }

    if (!current) {
      if (input.expectedRevision !== null) return { status: "conflict" as const, revision: null, encryptedPayload: null };
      try {
        await db.insert(guestSyncVaults).values({
          id: randomUUID(),
          accessKeyHash: keyHash,
          encryptedPayload: input.encryptedPayload,
          revision: 1,
          status: "active",
          expiresAt: expiryFromNow(),
        });
        return { status: "saved" as const, revision: 1 };
      } catch {
        const raced = await readRow(db, keyHash);
        if (!raced) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "共有ボックスを作成できませんでした。再度お試しください。" });
        return { status: raced.status === "active" ? "conflict" as const : raced.status as "revoked" | "expired", revision: raced.revision, encryptedPayload: raced.status === "active" ? raced.encryptedPayload : null };
      }
    }

    if (input.expectedRevision !== current.revision) return { status: "conflict" as const, revision: current.revision, encryptedPayload: current.encryptedPayload };
    const nextRevision = current.revision + 1;
    const result = await db.update(guestSyncVaults).set({ encryptedPayload: input.encryptedPayload, revision: nextRevision, expiresAt: expiryFromNow() })
      .where(and(
        eq(guestSyncVaults.accessKeyHash, keyHash),
        eq(guestSyncVaults.revision, current.revision),
        eq(guestSyncVaults.status, "active"),
        gt(guestSyncVaults.expiresAt, now),
      ));
    if (result[0].affectedRows > 0) return { status: "saved" as const, revision: nextRevision };

    const raced = await readRow(db, keyHash);
    if (!raced) return { status: "missing" as const, revision: null };
    return { status: raced.status === "active" ? "conflict" as const : raced.status as "revoked" | "expired", revision: raced.revision, encryptedPayload: raced.status === "active" ? raced.encryptedPayload : null };
  }),

  revoke: publicProcedure.input(z.object({ accessKey: ACCESS_KEY })).mutation(async ({ input }) => {
    const db = await requireDatabase();
    const keyHash = hashGuestAccessKey(input.accessKey);
    const current = await readRow(db, keyHash);
    if (!current) return { status: "missing" as const };
    if (current.status !== "active") return { status: current.status as "revoked" | "expired" };
    await db.update(guestSyncVaults).set({ status: "revoked", encryptedPayload: "", expiresAt: new Date() })
      .where(and(eq(guestSyncVaults.accessKeyHash, keyHash), eq(guestSyncVaults.status, "active")));
    return { status: "revoked" as const };
  }),
});
