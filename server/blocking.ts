import { and, eq, or } from "drizzle-orm";
import { userBlocks, users } from "../drizzle/schema";
import { requireDatabase } from "./return-utils";

type Database = Awaited<ReturnType<typeof requireDatabase>>;
type QueryDatabase = Pick<Database, "select">;
export type BlockPair = { blockerId: number; blockedId: number };

/** Lock the same user rows individually and in ascending order in every pair-scoped transaction. */
export async function lockUserPair(db: QueryDatabase, firstUserId: number, secondUserId: number) {
  const ids = [...new Set([firstUserId, secondUserId])].sort((a, b) => a - b);
  for (const id of ids) {
    await db.select({ id: users.id }).from(users).where(eq(users.id, id)).for("update").limit(1);
  }
}

export function pairIsBlocked(rows: readonly BlockPair[], firstUserId: number, secondUserId: number) {
  if (firstUserId === secondUserId) return false;
  return rows.some(row =>
    (row.blockerId === firstUserId && row.blockedId === secondUserId) ||
    (row.blockerId === secondUserId && row.blockedId === firstUserId),
  );
}

export async function hasBlockBetween(db: QueryDatabase, firstUserId: number, secondUserId: number) {
  if (firstUserId === secondUserId) return false;
  const rows = await db.select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(or(
      and(eq(userBlocks.blockerId, firstUserId), eq(userBlocks.blockedId, secondUserId)),
      and(eq(userBlocks.blockerId, secondUserId), eq(userBlocks.blockedId, firstUserId)),
    ))
    .limit(1);
  return pairIsBlocked(rows, firstUserId, secondUserId);
}

export async function getInteractingBlockedIds(db: QueryDatabase, userId: number) {
  const rows = await db.select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));
  return new Set(rows.map(row => row.blockerId === userId ? row.blockedId : row.blockerId));
}
