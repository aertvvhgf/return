import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { notificationPreferences, notifications } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDatabase } from "../return-utils";

export const noticeKinds = ["application", "decision", "status", "message", "handover", "completion", "cancelled", "match", "chat"] as const;
export const notificationLabels: Record<(typeof noticeKinds)[number], string> = {
  application: "仲介申請",
  decision: "申請への返答",
  status: "案件の進捗",
  message: "メッセージ",
  handover: "受け渡し案・日時",
  completion: "受け渡し完了確認",
  cancelled: "キャンセル",
  match: "紛失物の照合候補",
  chat: "トークの新着メッセージ",
};

export const notificationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const [items, unreadRows] = await Promise.all([
      db.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(100),
      db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))).limit(500),
    ]);
    return { items, unreadCount: unreadRows.length };
  }),
  markRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));
    return { updated: true };
  }),
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDatabase();
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)));
    return { updated: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    await db.delete(notifications).where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));
    return { deleted: true };
  }),
  deleteAll: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDatabase();
    await db.delete(notifications).where(eq(notifications.userId, ctx.user.id));
    return { deleted: true };
  }),
  preferences: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, ctx.user.id));
    return noticeKinds.map(kind => ({ kind, label: notificationLabels[kind], enabled: rows.find(row => row.kind === kind)?.enabled ?? true }));
  }),
  setPreference: protectedProcedure.input(z.object({ kind: z.enum(noticeKinds), enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const current = await db.select({ id: notificationPreferences.id }).from(notificationPreferences)
      .where(and(eq(notificationPreferences.userId, ctx.user.id), eq(notificationPreferences.kind, input.kind))).limit(1);
    if (current[0]) {
      await db.update(notificationPreferences).set({ enabled: input.enabled }).where(eq(notificationPreferences.id, current[0].id));
    } else {
      await db.insert(notificationPreferences).values({ userId: ctx.user.id, kind: input.kind, enabled: input.enabled });
    }
    return { saved: true };
  }),
});
