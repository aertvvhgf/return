import { and, desc, eq, gt, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  chatMembers,
  chatMessages,
  chatThreads,
  chatReactions,
  chatPins,
  foundPosts,
  mediations,
  notifications,
  userBlocks,
  userSafetyReports,
  users,
} from "../../drizzle/schema";
import { getInteractingBlockedIds, hasBlockBetween } from "../blocking";
import { protectedProcedure, router } from "../_core/trpc";
import { createNotification, requireDatabase } from "../return-utils";
import { notifyOwner } from "../_core/notification";
import { findSensitiveInformation } from "../privacy";
import { sanitizeJpegDataUrl } from "../image-data";
import { storagePut } from "../storage";

const threadId = z.string().uuid();
const MAX_GROUP_MEMBERS = 50;
const MAX_MESSAGE_LENGTH = 2000;

type Database = Awaited<ReturnType<typeof requireDatabase>>;
type MemberRow = { threadId: string; userId: number; role: "owner" | "member"; name: string | null };

function displayName(name: string | null | undefined) {
  return name?.trim() || "名前未設定のユーザー";
}

function dmKeyFor(firstUserId: number, secondUserId: number) {
  return [firstUserId, secondUserId].sort((a, b) => a - b).join(":");
}

function ensureSafeMessage(body: string) {
  if (findSensitiveInformation(body).length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "安全のため、電話番号・メールアドレス・詳細な住所・SNS ID・カード番号・外部リンクは送信できません。待ち合わせはアプリ内の受け渡し機能を使ってください。",
    });
  }
}

async function activeMembership(db: Database, targetThreadId: string, userId: number) {
  const rows = await db.select().from(chatMembers)
    .where(and(eq(chatMembers.threadId, targetThreadId), eq(chatMembers.userId, userId), isNull(chatMembers.leftAt)))
    .limit(1);
  const membership = rows[0];
  if (!membership) throw new TRPCError({ code: "NOT_FOUND", message: "このトークが見つからないか、参加していません。" });
  return membership;
}

async function loadThread(db: Database, targetThreadId: string) {
  const rows = await db.select().from(chatThreads).where(eq(chatThreads.id, targetThreadId)).limit(1);
  const thread = rows[0];
  if (!thread) throw new TRPCError({ code: "NOT_FOUND", message: "このトークは見つかりません。" });
  return thread;
}

async function loadMembers(db: Database, threadIds: string[]) {
  if (!threadIds.length) return [] as MemberRow[];
  return db.select({
    threadId: chatMembers.threadId,
    userId: chatMembers.userId,
    role: chatMembers.role,
    name: users.name,
  }).from(chatMembers)
    .innerJoin(users, eq(users.id, chatMembers.userId))
    .where(and(inArray(chatMembers.threadId, threadIds), isNull(chatMembers.leftAt)));
}

function summarizeThread(
  thread: typeof chatThreads.$inferSelect,
  viewerId: number,
  members: MemberRow[],
  unreadCount: number,
  blockedIds: Set<number>,
) {
  const others = members.filter(member => member.userId !== viewerId);
  const other = others[0];
  return {
    id: thread.id,
    kind: thread.kind,
    title: thread.kind === "group"
      ? (thread.title?.trim() || "グループトーク")
      : (other ? displayName(other.name) : "トーク"),
    topic: thread.topic,
    postId: thread.postId,
    mediationId: thread.mediationId,
    memberCount: members.length,
    members: members.map(member => ({
      id: member.userId,
      name: displayName(member.name),
      role: member.role,
      isMe: member.userId === viewerId,
    })),
    counterpartId: thread.kind === "dm" ? (other?.userId ?? null) : null,
    counterpartName: thread.kind === "dm" && other ? displayName(other.name) : null,
    lastMessageAt: thread.lastMessageAt,
    lastMessagePreview: thread.lastMessagePreview ?? "まだメッセージはありません",
    lastMessageSenderId: thread.lastMessageSenderId,
    unreadCount,
    communicationBlocked: others.some(member => blockedIds.has(member.userId)),
  };
}

/** Contacts are people the viewer already shares a mediation or a chat with. */
async function contactIds(db: Database, userId: number) {
  const [cases, directThreads] = await Promise.all([
    db.select({ applicantId: mediations.applicantId, ownerId: mediations.ownerId }).from(mediations)
      .where(or(eq(mediations.applicantId, userId), eq(mediations.ownerId, userId))).limit(200),
    db.select({ threadId: chatMembers.threadId }).from(chatMembers)
      .innerJoin(chatThreads, eq(chatThreads.id, chatMembers.threadId))
      .where(and(eq(chatMembers.userId, userId), isNull(chatMembers.leftAt))).limit(200),
  ]);
  const ids = new Set<number>();
  for (const row of cases) {
    const other = row.applicantId === userId ? row.ownerId : row.applicantId;
    if (other !== userId) ids.add(other);
  }
  if (directThreads.length) {
    const rows = await db.select({ threadId: chatMembers.threadId, userId: chatMembers.userId }).from(chatMembers)
      .where(and(
        inArray(chatMembers.threadId, directThreads.map(item => item.threadId)),
        ne(chatMembers.userId, userId),
        isNull(chatMembers.leftAt),
      ));
    for (const row of rows) ids.add(row.userId);
  }
  return [...ids];
}

async function notifyThread(db: Database, input: {
  thread: typeof chatThreads.$inferSelect;
  senderName: string;
  body: string;
  recipientIds: number[];
}) {
  const preview = input.body.replace(/\s+/g, " ").slice(0, 80);
  const title = input.thread.kind === "group"
    ? `${input.thread.title?.trim() || "グループトーク"}に新着メッセージ`
    : `${input.senderName}さんからメッセージ`;
  for (const recipientId of input.recipientIds) {
    // Keep at most one unread chat notice per thread per 10 minutes.
    const recent = await db.select({ id: notifications.id }).from(notifications)
      .where(and(
        eq(notifications.userId, recipientId),
        eq(notifications.threadId, input.thread.id),
        eq(notifications.kind, "chat"),
        isNull(notifications.readAt),
        gt(notifications.createdAt, new Date(Date.now() - 10 * 60_000)),
      )).limit(1);
    if (recent.length) continue;
    await createNotification(recipientId, "chat", title, preview, null, input.thread.id);
  }
}

export const chatRouter = router({
  /** Thread list with unread counts, newest activity first. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const memberships = await db.select({ thread: chatThreads, member: chatMembers })
      .from(chatMembers)
      .innerJoin(chatThreads, eq(chatThreads.id, chatMembers.threadId))
      .where(and(eq(chatMembers.userId, ctx.user.id), isNull(chatMembers.leftAt)))
      .orderBy(desc(chatThreads.lastMessageAt))
      .limit(80);
    const ids = memberships.map(row => row.thread.id);
    if (!ids.length) return [];
    const blockedIds = await getInteractingBlockedIds(db, ctx.user.id);
    const [members, unreadRows] = await Promise.all([
      loadMembers(db, ids),
      db.select({ threadId: chatMessages.threadId, count: sql<number>`count(*)` })
        .from(chatMessages)
        .innerJoin(chatMembers, and(eq(chatMembers.threadId, chatMessages.threadId), eq(chatMembers.userId, ctx.user.id)))
        .where(and(
          inArray(chatMessages.threadId, ids),
          isNull(chatMembers.leftAt),
          ne(chatMessages.senderId, ctx.user.id),
          eq(chatMessages.kind, "text"),
          blockedIds.size ? notInArray(chatMessages.senderId, [...blockedIds]) : undefined,
          sql`${chatMessages.id} > coalesce(${chatMembers.lastReadMessageId}, 0)`,
        ))
        .groupBy(chatMessages.threadId),
    ]);
    const unreadByThread = new Map(unreadRows.map(row => [row.threadId, Number(row.count)]));
    return memberships.map(row => summarizeThread(
      row.thread,
      ctx.user.id,
      members.filter(member => member.threadId === row.thread.id),
      unreadByThread.get(row.thread.id) ?? 0,
      blockedIds,
    ));
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const blockedIds = await getInteractingBlockedIds(db, ctx.user.id);
    const rows = await db.select({ count: sql<number>`count(*)` })
      .from(chatMessages)
      .innerJoin(chatMembers, and(eq(chatMembers.threadId, chatMessages.threadId), eq(chatMembers.userId, ctx.user.id)))
      .where(and(
        isNull(chatMembers.leftAt),
        ne(chatMessages.senderId, ctx.user.id),
        eq(chatMessages.kind, "text"),
        blockedIds.size ? notInArray(chatMessages.senderId, [...blockedIds]) : undefined,
        sql`${chatMessages.id} > coalesce(${chatMembers.lastReadMessageId}, 0)`,
      ));
    return { count: Number(rows[0]?.count ?? 0) };
  }),

  /** People the viewer can start a chat with (existing mediations and chats). */
  contacts: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const ids = await contactIds(db, ctx.user.id);
    if (!ids.length) return [];
    const blockedIds = await getInteractingBlockedIds(db, ctx.user.id);
    const [people, keys] = await Promise.all([
      db.select({ id: users.id, name: users.name, kana: users.kana }).from(users).where(inArray(users.id, ids)),
      db.select({ dmKey: chatThreads.dmKey }).from(chatThreads)
        .where(inArray(chatThreads.dmKey, ids.map(id => dmKeyFor(ctx.user.id, id)))),
    ]);
    const threadKeys = new Set(keys.map(row => row.dmKey ?? ""));
    return people
      .filter(person => !blockedIds.has(person.id))
      .map(person => ({
        id: person.id,
        name: displayName(person.name),
        kana: person.kana,
        hasThread: threadKeys.has(dmKeyFor(ctx.user.id, person.id)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }),

  /** Find a user by the shareable profile ID printed in the app and QR code. */
  profileLookup: protectedProcedure.input(z.object({ profileCode: z.string().trim().toUpperCase().regex(/^R[0-9]{7,}$/) })).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [person] = await db.select({ id: users.id, profileCode: users.profileCode, name: users.name }).from(users)
      .where(eq(users.profileCode, input.profileCode)).limit(1);
    if (!person || person.id === ctx.user.id || await hasBlockBetween(db, ctx.user.id, person.id)) return null;
    return { id: person.id, profileCode: person.profileCode, name: displayName(person.name) };
  }),

  /** Thread detail with the newest messages. `afterId` returns only newer messages for polling. */
  messages: protectedProcedure.input(z.object({
    threadId,
    afterId: z.number().int().nonnegative().optional(),
    beforeId: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const membership = await activeMembership(db, input.threadId, ctx.user.id);
    const thread = await loadThread(db, input.threadId);
    const members = await loadMembers(db, [thread.id]);
    const blockedIds = await getInteractingBlockedIds(db, ctx.user.id);
    const filters: SQL[] = [eq(chatMessages.threadId, thread.id)];
    if (blockedIds.size) filters.push(notInArray(chatMessages.senderId, [...blockedIds]));
    if (input.afterId != null) filters.push(gt(chatMessages.id, input.afterId));
    if (input.beforeId != null) filters.push(sql`${chatMessages.id} < ${input.beforeId}`);
    const rows = await db.select().from(chatMessages)
      .where(and(...filters))
      .orderBy(desc(chatMessages.id))
      .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const page = rows.slice(0, input.limit).reverse();
    const nameById = new Map(members.map(member => [member.userId, displayName(member.name)]));
    const others = members.filter(member => member.userId !== ctx.user.id);
    const messageIds = page.map(message => message.id);
    const [pinRows, reactionRows] = messageIds.length ? await Promise.all([
      db.select({ messageId: chatPins.messageId }).from(chatPins).where(and(eq(chatPins.threadId, thread.id), inArray(chatPins.messageId, messageIds))),
      db.select({ messageId: chatReactions.messageId, userId: chatReactions.userId, emoji: chatReactions.emoji }).from(chatReactions).where(inArray(chatReactions.messageId, messageIds)),
    ]) : [[], []] as const;
    const pinnedIds = new Set(pinRows.map(row => row.messageId));
    const reactionsByMessage = new Map<number, Map<string, { emoji: string; count: number; active: boolean }>>();
    for (const row of reactionRows) {
      const byEmoji = reactionsByMessage.get(row.messageId) ?? new Map();
      const current = byEmoji.get(row.emoji) ?? { emoji: row.emoji, count: 0, active: false };
      current.count += 1;
      current.active ||= row.userId === ctx.user.id;
      byEmoji.set(row.emoji, current);
      reactionsByMessage.set(row.messageId, byEmoji);
    }
    return {
      thread: summarizeThread(thread, ctx.user.id, members, 0, blockedIds),
      messages: page.map(message => ({
        id: message.id,
        senderId: message.senderId,
        senderName: nameById.get(message.senderId) ?? displayName(null),
        kind: message.kind,
        body: message.body,
        attachmentUrl: message.attachmentUrl,
        attachmentName: message.attachmentName,
        createdAt: message.createdAt,
        isMine: message.senderId === ctx.user.id,
        pinned: pinnedIds.has(message.id),
        reactions: [...(reactionsByMessage.get(message.id)?.values() ?? [])],
      })),
      hasMore,
      canPost: thread.kind === "dm" ? !others.some(member => blockedIds.has(member.userId)) : true,
      lastReadMessageId: membership.lastReadMessageId,
    };
  }),

  send: protectedProcedure.input(z.object({
    threadId,
    body: z.string().trim().max(MAX_MESSAGE_LENGTH, "メッセージが長すぎます。"),
    attachmentUrl: z.string().max(1_500_000).optional(),
    attachmentName: z.string().max(160).optional(),
    imageDataUrl: z.string().max(7_500_000).optional(),
  }).refine(value => value.body.length > 0 || Boolean(value.attachmentUrl) || Boolean(value.imageDataUrl), "メッセージまたは画像を選択してください。")).mutation(async ({ ctx, input }) => {
    ensureSafeMessage(input.body);
    const db = await requireDatabase();
    let attachmentUrl = input.attachmentUrl;
    if (input.imageDataUrl) {
      const safeDataUrl = sanitizeJpegDataUrl(input.imageDataUrl, 5 * 1024 * 1024);
      if (!safeDataUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "画像を読み取れません。JPEG画像を選び直してください。" });
      try {
        const bytes = Buffer.from(safeDataUrl.slice(safeDataUrl.indexOf(",") + 1), "base64");
        const stored = await storagePut(`return/${ctx.user.id}/chat-${crypto.randomUUID()}.jpg`, bytes, "image/jpeg");
        attachmentUrl = stored.url;
      } catch {
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "画像を安全に保存できませんでした。時間をおいて再度お試しください。" });
      }
    }
    const sent = await db.transaction(async tx => {
      const threadRows = await tx.select().from(chatThreads).where(eq(chatThreads.id, input.threadId)).for("update").limit(1);
      const thread = threadRows[0];
      if (!thread) throw new TRPCError({ code: "NOT_FOUND", message: "このトークは見つかりません。" });
      const membershipRows = await tx.select().from(chatMembers)
        .where(and(eq(chatMembers.threadId, thread.id), eq(chatMembers.userId, ctx.user.id), isNull(chatMembers.leftAt))).limit(1);
      if (!membershipRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "このトークに参加していません。" });
      const recent = await tx.select({ id: chatMessages.id }).from(chatMessages)
        .where(and(eq(chatMessages.senderId, ctx.user.id), gt(chatMessages.createdAt, new Date(Date.now() - 60_000))))
        .limit(30);
      if (recent.length >= 30) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "送信が多すぎます。少し待ってからお試しください。" });
      const memberRows = await tx.select({ userId: chatMembers.userId }).from(chatMembers)
        .where(and(eq(chatMembers.threadId, thread.id), isNull(chatMembers.leftAt)));
      const otherIds = memberRows.map(row => row.userId).filter(id => id !== ctx.user.id);
      if (thread.kind === "dm" && otherIds[0] != null) {
        if (await hasBlockBetween(tx, ctx.user.id, otherIds[0])) {
          throw new TRPCError({ code: "FORBIDDEN", message: "この相手とのやり取りは停止されています。ブロックを解除すると再開できます。" });
        }
      }
      const inserted = await tx.insert(chatMessages).values({ threadId: thread.id, senderId: ctx.user.id, kind: attachmentUrl ? "image" : "text", body: input.body || "画像を送信しました", attachmentUrl: attachmentUrl ?? null, attachmentName: input.attachmentName ?? null });
      const messageId = Number(inserted[0].insertId);
      await tx.update(chatThreads).set({
        lastMessageAt: new Date(),
        lastMessagePreview: (input.body || "画像").replace(/\s+/g, " ").slice(0, 160),
        lastMessageSenderId: ctx.user.id,
      }).where(eq(chatThreads.id, thread.id));
      await tx.update(chatMembers).set({ lastReadMessageId: messageId })
        .where(and(eq(chatMembers.threadId, thread.id), eq(chatMembers.userId, ctx.user.id)));
      return { thread, otherIds, messageId };
    });
    const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (sent.otherIds.length) {
      const mutedRows = await db.select({ userId: chatMembers.userId }).from(chatMembers)
        .where(and(eq(chatMembers.threadId, sent.thread.id), inArray(chatMembers.userId, sent.otherIds), eq(chatMembers.muted, true)));
      const muted = new Set(mutedRows.map(row => row.userId));
      const blockedIds = await getInteractingBlockedIds(db, ctx.user.id);
      const targets = sent.otherIds.filter(id => !muted.has(id) && !blockedIds.has(id));
      if (targets.length) {
        await notifyThread(db, {
          thread: sent.thread,
          senderName: displayName(me?.name),
          body: input.body || "画像を送信しました",
          recipientIds: targets,
        });
      }
    }
    return { sent: true, messageId: sent.messageId };
  }),

  search: protectedProcedure.input(z.object({ threadId, query: z.string().trim().min(1).max(100) })).query(async ({ ctx, input }) => {
    await activeMembership(await requireDatabase(), input.threadId, ctx.user.id);
    const db = await requireDatabase();
    const blocked = await getInteractingBlockedIds(db, ctx.user.id);
    const rows = await db.select().from(chatMessages).where(and(eq(chatMessages.threadId, input.threadId), sql`lower(${chatMessages.body}) like ${"%" + input.query.toLowerCase() + "%"}`, blocked.size ? notInArray(chatMessages.senderId, [...blocked]) : undefined)).orderBy(desc(chatMessages.id)).limit(50);
    return rows.map(row => ({ id: row.id, body: row.body, kind: row.kind, createdAt: row.createdAt }));
  }),

  react: protectedProcedure.input(z.object({ threadId, messageId: z.number().int().positive(), emoji: z.string().min(1).max(16) })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase(); await activeMembership(db, input.threadId, ctx.user.id);
    const [message] = await db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.id, input.messageId), eq(chatMessages.threadId, input.threadId))).limit(1);
    if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "このメッセージが見つかりません。" });
    const existing = await db.select({ id: chatReactions.id }).from(chatReactions).where(and(eq(chatReactions.messageId, input.messageId), eq(chatReactions.userId, ctx.user.id), eq(chatReactions.emoji, input.emoji))).limit(1);
    if (existing[0]) await db.delete(chatReactions).where(eq(chatReactions.id, existing[0].id)); else await db.insert(chatReactions).values({ messageId: input.messageId, userId: ctx.user.id, emoji: input.emoji });
    return { active: !existing[0] };
  }),

  pin: protectedProcedure.input(z.object({ threadId, messageId: z.number().int().positive(), pinned: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase(); await activeMembership(db, input.threadId, ctx.user.id);
    const [message] = await db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.id, input.messageId), eq(chatMessages.threadId, input.threadId))).limit(1);
    if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "このメッセージが見つかりません。" });
    if (input.pinned) { const existing = await db.select({ id: chatPins.id }).from(chatPins).where(and(eq(chatPins.threadId, input.threadId), eq(chatPins.messageId, input.messageId))).limit(1); if (!existing[0]) await db.insert(chatPins).values({ threadId: input.threadId, messageId: input.messageId, pinnedBy: ctx.user.id }); }
    else await db.delete(chatPins).where(and(eq(chatPins.threadId, input.threadId), eq(chatPins.messageId, input.messageId)));
    return { pinned: input.pinned };
  }),

  markRead: protectedProcedure.input(z.object({ threadId })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const membership = await activeMembership(db, input.threadId, ctx.user.id);
    const [latest] = await db.select({ id: sql<number>`coalesce(max(${chatMessages.id}), 0)` })
      .from(chatMessages).where(eq(chatMessages.threadId, input.threadId));
    const latestId = Number(latest?.id ?? 0);
    if (latestId > (membership.lastReadMessageId ?? 0)) {
      await db.update(chatMembers).set({ lastReadMessageId: latestId }).where(eq(chatMembers.id, membership.id));
    }
    return { read: true };
  }),

  /** Create (or reopen) a 1:1 thread from an existing contact, found post, or shared profile ID. */
  startDm: protectedProcedure.input(z.object({
    userId: z.number().int().positive().optional(),
    profileCode: z.string().trim().toUpperCase().regex(/^R[0-9]{7,}$/).optional(),
    postId: z.number().int().positive().optional(),
  }).refine(value => Boolean(value.userId || value.profileCode), "相手のプロフィールIDを指定してください。")).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [target] = await db.select({ id: users.id }).from(users).where(input.profileCode ? eq(users.profileCode, input.profileCode) : eq(users.id, input.userId!)).limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "相手のアカウントが見つかりません。" });
    if (target.id === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "自分自身とはトークを開始できません。" });
    const targetUserId = target.id;
    if (await hasBlockBetween(db, ctx.user.id, targetUserId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "この相手とはやり取りできません。ブロック状態を確認してください。" });
    }
    const dmKey = dmKeyFor(ctx.user.id, targetUserId);
    const existing = await db.select({ id: chatThreads.id }).from(chatThreads).where(eq(chatThreads.dmKey, dmKey)).limit(1);
    if (existing[0]) {
      await db.update(chatMembers).set({ leftAt: null })
        .where(and(eq(chatMembers.threadId, existing[0].id), eq(chatMembers.userId, ctx.user.id)));
      return { threadId: existing[0].id, created: false };
    }
    const contacts = await contactIds(db, ctx.user.id);
    let allowed = Boolean(input.profileCode) || contacts.includes(targetUserId);
    if (!allowed && input.postId) {
      const [post] = await db.select({ ownerId: foundPosts.ownerId, status: foundPosts.status }).from(foundPosts)
        .where(eq(foundPosts.id, input.postId)).limit(1);
      allowed = Boolean(post && post.status === "active" && post.ownerId === targetUserId);
    }
    if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "やり取りのない相手には新規トークを送れません。拾得投稿の詳細や仲介案件から開始してください。" });
    const id = crypto.randomUUID();
    try {
      await db.transaction(async tx => {
        await tx.insert(chatThreads).values({
          id,
          kind: "dm",
          dmKey,
          createdBy: ctx.user.id,
          postId: input.postId ?? null,
          lastMessageAt: new Date(),
        });
        await tx.insert(chatMembers).values([
          { threadId: id, userId: ctx.user.id, role: "owner" },
          { threadId: id, userId: targetUserId, role: "member" },
        ]);
      });
    } catch (error) {
      const duplicate = await db.select({ id: chatThreads.id }).from(chatThreads).where(eq(chatThreads.dmKey, dmKey)).limit(1);
      if (duplicate[0]) return { threadId: duplicate[0].id, created: false };
      throw error;
    }
    return { threadId: id, created: true };
  }),

  /** Open a 1:1 thread with the owner of a found post from the public post detail. */
  startWithPost: protectedProcedure.input(z.object({ postId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [post] = await db.select({ ownerId: foundPosts.ownerId, status: foundPosts.status, title: foundPosts.title })
      .from(foundPosts).where(eq(foundPosts.id, input.postId)).limit(1);
    if (!post || post.status !== "active") throw new TRPCError({ code: "NOT_FOUND", message: "この投稿は現在公開されていません。" });
    if (post.ownerId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "自分の投稿です。トーク一覧から確認してください。" });
    if (await hasBlockBetween(db, ctx.user.id, post.ownerId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "この投稿者とはやり取りできません。" });
    }
    const dmKey = dmKeyFor(ctx.user.id, post.ownerId);
    const existing = await db.select({ id: chatThreads.id }).from(chatThreads).where(eq(chatThreads.dmKey, dmKey)).limit(1);
    if (existing[0]) {
      await db.update(chatMembers).set({ leftAt: null })
        .where(and(eq(chatMembers.threadId, existing[0].id), eq(chatMembers.userId, ctx.user.id)));
      return { threadId: existing[0].id, created: false };
    }
    const id = crypto.randomUUID();
    await db.transaction(async tx => {
      await tx.insert(chatThreads).values({
        id,
        kind: "dm",
        dmKey,
        createdBy: ctx.user.id,
        postId: input.postId,
        topic: post.title.slice(0, 200),
        lastMessageAt: new Date(),
        lastMessagePreview: `「${post.title.slice(0, 60)}」についてのトークを開始しました。`,
      });
      await tx.insert(chatMembers).values([
        { threadId: id, userId: ctx.user.id, role: "owner" },
        { threadId: id, userId: post.ownerId, role: "member" },
      ]);
      await tx.insert(chatMessages).values({
        threadId: id,
        senderId: ctx.user.id,
        kind: "system",
        body: `「${post.title.slice(0, 60)}」についてのトークを開始しました。`,
      });
    });
    return { threadId: id, created: true };
  }),

  createGroup: protectedProcedure.input(z.object({
    title: z.string().trim().min(1, "グループ名を入力してください。").max(60, "グループ名は60文字までです。"),
    memberIds: z.array(z.number().int().positive()).min(1, "メンバーを1人以上選んでください。").max(20),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const memberIds = [...new Set(input.memberIds)].filter(id => id !== ctx.user.id);
    if (!memberIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "自分以外のメンバーを選んでください。" });
    const contacts = await contactIds(db, ctx.user.id);
    if (memberIds.some(id => !contacts.includes(id))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "やり取りのある相手だけをグループに招待できます。" });
    }
    const blocked = new Set(await getInteractingBlockedIds(db, ctx.user.id));
    if (memberIds.some(id => blocked.has(id))) throw new TRPCError({ code: "FORBIDDEN", message: "ブロック中の相手はグループに招待できません。" });
    const id = crypto.randomUUID();
    await db.transaction(async tx => {
      await tx.insert(chatThreads).values({
        id,
        kind: "group",
        title: input.title,
        createdBy: ctx.user.id,
        lastMessageAt: new Date(),
        lastMessagePreview: `「${input.title}」のグループトークを作成しました。`,
      });
      await tx.insert(chatMembers).values([
        { threadId: id, userId: ctx.user.id, role: "owner" },
        ...memberIds.map(userId => ({ threadId: id, userId, role: "member" as const })),
      ]);
      await tx.insert(chatMessages).values({
        threadId: id,
        senderId: ctx.user.id,
        kind: "system",
        body: `「${input.title}」のグループトークを作成しました。`,
      });
    });
    for (const memberId of memberIds) {
      await createNotification(memberId, "chat", "グループトークに招待されました", `「${input.title}」に招待されました。`, null, id);
    }
    return { threadId: id };
  }),

  addMembers: protectedProcedure.input(z.object({
    threadId,
    memberIds: z.array(z.number().int().positive()).min(1).max(20),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    await activeMembership(db, input.threadId, ctx.user.id);
    const thread = await loadThread(db, input.threadId);
    if (thread.kind !== "group") throw new TRPCError({ code: "BAD_REQUEST", message: "1対1のトークにはメンバーを追加できません。" });
    const current = await db.select({ userId: chatMembers.userId }).from(chatMembers)
      .where(and(eq(chatMembers.threadId, thread.id), isNull(chatMembers.leftAt)));
    const currentIds = new Set(current.map(row => row.userId));
    const memberIds = [...new Set(input.memberIds)].filter(id => !currentIds.has(id));
    if (!memberIds.length) return { added: 0 };
    if (currentIds.size + memberIds.length > MAX_GROUP_MEMBERS) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `グループの上限は${MAX_GROUP_MEMBERS}人です。` });
    }
    const contacts = await contactIds(db, ctx.user.id);
    if (memberIds.some(id => !contacts.includes(id))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "やり取りのある相手だけを招待できます。" });
    }
    const blocked = new Set(await getInteractingBlockedIds(db, ctx.user.id));
    if (memberIds.some(id => blocked.has(id))) throw new TRPCError({ code: "FORBIDDEN", message: "ブロック中の相手は招待できません。" });
    await db.transaction(async tx => {
      const existing = await tx.select({ userId: chatMembers.userId }).from(chatMembers)
        .where(and(eq(chatMembers.threadId, thread.id), inArray(chatMembers.userId, memberIds)));
      const existingIds = new Set(existing.map(row => row.userId));
      const fresh = memberIds.filter(id => !existingIds.has(id));
      if (fresh.length) {
        await tx.insert(chatMembers).values(fresh.map(userId => ({ threadId: thread.id, userId, role: "member" as const })));
      }
      if (existingIds.size) {
        await tx.update(chatMembers).set({ leftAt: null })
          .where(and(eq(chatMembers.threadId, thread.id), inArray(chatMembers.userId, [...existingIds])));
      }
      await tx.insert(chatMessages).values({
        threadId: thread.id,
        senderId: ctx.user.id,
        kind: "system",
        body: `${memberIds.length}人がグループに参加しました。`,
      });
      await tx.update(chatThreads).set({ lastMessageAt: new Date() }).where(eq(chatThreads.id, thread.id));
    });
    for (const memberId of memberIds) {
      await createNotification(memberId, "chat", "グループトークに追加されました", `「${thread.title ?? "グループトーク"}」に追加されました。`, null, thread.id);
    }
    return { added: memberIds.length };
  }),

  updateGroup: protectedProcedure.input(z.object({
    threadId,
    title: z.string().trim().min(1).max(60),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    await activeMembership(db, input.threadId, ctx.user.id);
    const thread = await loadThread(db, input.threadId);
    if (thread.kind !== "group") throw new TRPCError({ code: "BAD_REQUEST", message: "グループトークのみ名前を変更できます。" });
    if (thread.createdBy !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "グループ名を変更できるのは作成者だけです。" });
    await db.update(chatThreads).set({ title: input.title }).where(eq(chatThreads.id, thread.id));
    return { updated: true };
  }),

  setMuted: protectedProcedure.input(z.object({ threadId, muted: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const membership = await activeMembership(db, input.threadId, ctx.user.id);
    await db.update(chatMembers).set({ muted: input.muted }).where(eq(chatMembers.id, membership.id));
    return { muted: input.muted };
  }),

  leave: protectedProcedure.input(z.object({ threadId })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const membership = await activeMembership(db, input.threadId, ctx.user.id);
    const thread = await loadThread(db, input.threadId);
    if (thread.kind === "dm") throw new TRPCError({ code: "BAD_REQUEST", message: "1対1のトークは退出できません。相手のブロックか通報を利用してください。" });
    await db.transaction(async tx => {
      await tx.update(chatMembers).set({ leftAt: new Date() }).where(eq(chatMembers.id, membership.id));
      await tx.insert(chatMessages).values({
        threadId: thread.id,
        senderId: ctx.user.id,
        kind: "system",
        body: "メンバーがグループから退出しました。",
      });
      await tx.update(chatThreads).set({ lastMessageAt: new Date() }).where(eq(chatThreads.id, thread.id));
    });
    return { left: true };
  }),

  blockCounterpart: protectedProcedure.input(z.object({ threadId })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const thread = await loadThread(db, input.threadId);
    await activeMembership(db, thread.id, ctx.user.id);
    const members = await db.select({ userId: chatMembers.userId }).from(chatMembers)
      .where(and(eq(chatMembers.threadId, thread.id), isNull(chatMembers.leftAt), ne(chatMembers.userId, ctx.user.id)));
    if (thread.kind !== "dm" || members.length !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "ブロックは1対1のトークでのみ行えます。" });
    const blockedId = members[0].userId;
    await db.transaction(async tx => {
      const existing = await tx.select({ id: userBlocks.id }).from(userBlocks)
        .where(and(eq(userBlocks.blockerId, ctx.user.id), eq(userBlocks.blockedId, blockedId))).limit(1);
      if (!existing.length) {
        await tx.insert(userBlocks).values({ blockerId: ctx.user.id, blockedId, sourceMediationId: thread.mediationId ?? null });
      }
    });
    return { blocked: true };
  }),

  reportThread: protectedProcedure.input(z.object({
    threadId,
    category: z.enum(["personal_information", "harassment", "fraud", "unsafe_handover", "spam", "other"]),
    details: z.string().trim().min(5).max(2000),
    confirmDisclosure: z.literal(true),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const thread = await loadThread(db, input.threadId);
    await activeMembership(db, thread.id, ctx.user.id);
    const members = await db.select({ userId: chatMembers.userId }).from(chatMembers)
      .where(and(eq(chatMembers.threadId, thread.id), isNull(chatMembers.leftAt), ne(chatMembers.userId, ctx.user.id)));
    if (!members.length) throw new TRPCError({ code: "BAD_REQUEST", message: "通報できる相手がいません。" });
    const reportedUserId = members[0].userId;
    const id = crypto.randomUUID();
    await db.insert(userSafetyReports).values({
      id,
      reporterId: ctx.user.id,
      reportedUserId,
      postId: thread.postId,
      category: input.category,
      details: input.details,
    });
    let ownerNotificationAccepted = false;
    try {
      ownerNotificationAccepted = await notifyOwner({
        title: `returnの安全通報 (${id.slice(0, 8)})`,
        content: [
          `通報ID: ${id}`,
          `分類: ${input.category}`,
          `報告者ユーザーID: ${ctx.user.id}`,
          `対象ユーザーID: ${reportedUserId}`,
          `トークID: ${thread.id}`,
          "",
          "通報内容:",
          input.details,
        ].join("\n"),
      });
    } catch (error) {
      console.warn("[ChatReport] Owner notification failed:", error);
    }
    if (ownerNotificationAccepted) {
      await db.update(userSafetyReports).set({ ownerNotificationAccepted: true }).where(eq(userSafetyReports.id, id));
    }
    return { saved: true, reportId: id, ownerNotificationAccepted };
  }),
});

export const chatHelpers = { dmKeyFor, displayName };
