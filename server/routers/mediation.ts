import { and, desc, eq, gte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { foundPosts, mediationMessages, mediationReports, mediations, userBlocks, userSafetyReports, users } from "../../drizzle/schema";
import { hasBlockBetween, lockUserPair } from "../blocking";
import { protectedProcedure, router } from "../_core/trpc";
import { createNotification, publicFoundPost, requireDatabase } from "../return-utils";
import { notifyOwner } from "../_core/notification";
import { findSensitiveInformation } from "../privacy";

const mediationId = z.string().uuid();
const handoverMethod = z.enum(["public_facility", "police_station", "facility_reception"]);

function otherParty(caseRow: { applicantId: number; ownerId: number }, userId: number) {
  return caseRow.applicantId === userId ? caseRow.ownerId : caseRow.applicantId;
}
function ensureParticipant<T extends { applicantId: number; ownerId: number }>(caseRow: T | undefined, userId: number): T {
  if (!caseRow || (caseRow.applicantId !== userId && caseRow.ownerId !== userId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "案件が見つからないか、閲覧権限がありません。" });
  }
  return caseRow;
}
function safeMessage(body: string) {
  if (findSensitiveInformation(body).length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "安全のため、電話・メール・詳細住所・SNS ID・カード番号・外部リンクは送信できません。アプリ内の仲介機能で連絡してください。" });
  }
}

const safetyReportCategory = z.enum(["personal_information", "harassment", "fraud", "unsafe_handover", "spam", "other"]);
type SafetyReportCategory = z.infer<typeof safetyReportCategory>;

async function ensureUnblocked(db: Parameters<typeof hasBlockBetween>[0], firstUserId: number, secondUserId: number) {
  if (await hasBlockBetween(db, firstUserId, secondUserId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "この相手とのやり取りは現在停止されています。通報と案件終了は利用できます。" });
  }
}

async function saveAndNotifySafetyReport(input: {
  db: Awaited<ReturnType<typeof requireDatabase>>;
  reporterId: number;
  reportedUserId: number;
  mediationId: string | null;
  postId: number | null;
  category: SafetyReportCategory;
  details: string;
}) {
  const id = crypto.randomUUID();
  await input.db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, input.reporterId)).for("update").limit(1);
    const recentReports = await tx.select({ id: userSafetyReports.id }).from(userSafetyReports)
      .where(and(eq(userSafetyReports.reporterId, input.reporterId), gte(userSafetyReports.createdAt, new Date(Date.now() - 60_000))))
      .limit(1);
    if (recentReports.length) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "通報は1分に1件までです。少し待ってから再度お試しください。" });
    await tx.insert(userSafetyReports).values({
      id,
      reporterId: input.reporterId,
      reportedUserId: input.reportedUserId,
      mediationId: input.mediationId,
      postId: input.postId,
      category: input.category,
      details: input.details,
    });
  });
  let ownerNotificationAccepted = false;
  try {
    ownerNotificationAccepted = await notifyOwner({
      title: `returnの安全通報 (${id.slice(0, 8)})`,
      content: [
        `通報ID: ${id}`,
        `分類: ${input.category}`,
        `報告者ユーザーID: ${input.reporterId}`,
        `対象ユーザーID: ${input.reportedUserId}`,
        `案件ID: ${input.mediationId ?? "なし"}`,
        `投稿ID: ${input.postId ?? "なし"}`,
        "",
        "通報内容:",
        input.details,
      ].join("\n"),
    });
  } catch (error) {
    console.warn("[SafetyReport] Owner notification failed:", error);
  }
  if (ownerNotificationAccepted) {
    try {
      await input.db.update(userSafetyReports).set({ ownerNotificationAccepted: true }).where(eq(userSafetyReports.id, id));
    } catch (error) {
      console.warn("[SafetyReport] Could not record owner notification acceptance:", error);
    }
  }
  return { saved: true as const, reportId: id, ownerNotificationAccepted };
}

export const mediationRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const rows = await db.select({
      mediation: mediations,
      postTitle: foundPosts.title,
      postCategory: foundPosts.category,
    }).from(mediations)
      .leftJoin(foundPosts, eq(mediations.postId, foundPosts.id))
      .where(or(eq(mediations.applicantId, ctx.user.id), eq(mediations.ownerId, ctx.user.id)))
      .orderBy(desc(mediations.updatedAt));
    return rows.map(row => ({
      ...row.mediation,
      postTitle: row.postTitle ?? "拾得物投稿",
      postCategory: row.postCategory ?? "other",
      side: row.mediation.applicantId === ctx.user.id ? "applicant" as const : "owner" as const,
    }));
  }),

  start: protectedProcedure.input(z.object({ postId: z.number().int().positive(), evidence: z.string().trim().min(10).max(2000) })).mutation(async ({ ctx, input }) => {
    safeMessage(input.evidence);
    const db = await requireDatabase();
    const started = await db.transaction(async tx => {
      const posts = await tx.select().from(foundPosts).where(and(eq(foundPosts.id, input.postId), eq(foundPosts.status, "active"))).for("update").limit(1);
      const post = posts[0];
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "この投稿は現在公開されていません。" });
      if (post.ownerId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "自分の投稿に仲介申請はできません。" });
      await lockUserPair(tx, ctx.user.id, post.ownerId);
      await ensureUnblocked(tx, ctx.user.id, post.ownerId);
      const oldCases = await tx.select().from(mediations).where(and(eq(mediations.postId, input.postId), eq(mediations.applicantId, ctx.user.id))).limit(50);
      if (oldCases.some(item => !["cancelled", "handover_completed"].includes(item.status))) {
        throw new TRPCError({ code: "CONFLICT", message: "この投稿には進行中の申請があります。マイページの仲介管理をご確認ください。" });
      }
      const id = crypto.randomUUID();
      await tx.insert(mediations).values({ id, postId: post.id, applicantId: ctx.user.id, ownerId: post.ownerId, evidence: input.evidence, status: "application_pending" });
      return { id, ownerId: post.ownerId };
    });
    await createNotification(started.ownerId, "application", "拾得物に仲介申請が届きました", "所有者確認のための申請が届きました。アプリ内で特徴を確認してください。", started.id);
    return { id: started.id };
  }),

  detail: protectedProcedure.input(z.object({ id: mediationId })).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const rows = await db.select({ mediation: mediations, post: foundPosts })
      .from(mediations)
      .leftJoin(foundPosts, eq(mediations.postId, foundPosts.id))
      .where(eq(mediations.id, input.id)).limit(1);
    const row = rows[0];
    const caseRow = ensureParticipant(row?.mediation, ctx.user.id);
    const messages = await db.select().from(mediationMessages).where(eq(mediationMessages.mediationId, caseRow.id)).orderBy(mediationMessages.createdAt);
    const reports = await db.select({ id: mediationReports.id, category: mediationReports.category, details: mediationReports.details, createdAt: mediationReports.createdAt, reporterId: mediationReports.reporterId })
      .from(mediationReports).where(and(eq(mediationReports.mediationId, caseRow.id), eq(mediationReports.reporterId, ctx.user.id))).orderBy(desc(mediationReports.createdAt));
    const communicationBlocked = await hasBlockBetween(db, ctx.user.id, otherParty(caseRow, ctx.user.id));
    return {
      ...caseRow,
      post: row?.post ? publicFoundPost(row.post) : null,
      verificationHint: ctx.user.id === caseRow.ownerId ? (row?.post?.privateClues ?? null) : null,
      messages,
      reports,
      communicationBlocked,
    };
  }),

  sendMessage: protectedProcedure.input(z.object({ id: mediationId, body: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    safeMessage(input.body);
    const db = await requireDatabase();
    const messageInfo = await db.transaction(async tx => {
      const rows = await tx.select().from(mediations).where(eq(mediations.id, input.id)).for("update").limit(1);
      const caseRow = ensureParticipant(rows[0], ctx.user.id);
      const recipient = otherParty(caseRow, ctx.user.id);
      await lockUserPair(tx, ctx.user.id, recipient);
      await ensureUnblocked(tx, ctx.user.id, recipient);
      if (["cancelled", "handover_completed"].includes(caseRow.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "終了した案件ではメッセージを送信できません。" });
      await tx.insert(mediationMessages).values({ mediationId: caseRow.id, senderId: ctx.user.id, body: input.body });
      await tx.update(mediations).set({ updatedAt: new Date() }).where(eq(mediations.id, caseRow.id));
      return { mediationId: caseRow.id, recipient };
    });
    await createNotification(messageInfo.recipient, "message", "仲介案件にメッセージが届きました", "アプリを開いて内容を確認してください。", messageInfo.mediationId);
    return { sent: true };
  }),

  decide: protectedProcedure.input(z.object({
  id: mediationId,
  action: z.enum(["approve", "request_more", "reject"]),
  note: z.string().trim().min(2).max(1200),
  })).mutation(async ({ ctx, input }) => {
    safeMessage(input.note);
    const db = await requireDatabase();
    const result = await db.transaction(async tx => {
      const rows = await tx.select().from(mediations).where(eq(mediations.id, input.id)).for("update").limit(1);
      const caseRow = ensureParticipant(rows[0], ctx.user.id);
      await lockUserPair(tx, ctx.user.id, otherParty(caseRow, ctx.user.id));
      await ensureUnblocked(tx, ctx.user.id, otherParty(caseRow, ctx.user.id));
      if (caseRow.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "投稿者だけが申請に対応できます。" });
      if (caseRow.status !== "application_pending") throw new TRPCError({ code: "BAD_REQUEST", message: "この申請は対応済みです。" });
      if (input.action === "approve") {
        await tx.update(mediations).set({ status: "verification_in_progress", decisionNote: input.note }).where(eq(mediations.id, caseRow.id));
        return { status: "verification_in_progress" as const, applicantId: caseRow.applicantId, title: "仲介申請が確認されました", body: "所有確認のやり取りを開始できます。", cancelled: false };
      }
      if (input.action === "reject") {
        await tx.update(mediations).set({ status: "cancelled", decisionNote: input.note }).where(eq(mediations.id, caseRow.id));
        return { status: "cancelled" as const, applicantId: caseRow.applicantId, title: "仲介申請に返答がありました", body: "案件管理で投稿者からの説明をご確認ください。", cancelled: true };
      }
      await tx.update(mediations).set({ decisionNote: input.note }).where(eq(mediations.id, caseRow.id));
      await tx.insert(mediationMessages).values({ mediationId: caseRow.id, senderId: ctx.user.id, body: `追加確認のお願い: ${input.note}` });
      return { status: caseRow.status, applicantId: caseRow.applicantId, title: "仲介申請に追加確認のお願いがあります", body: "所有者確認のため、追加情報をご確認ください。", cancelled: false };
    });
    await createNotification(result.applicantId, "decision", result.title, result.body, input.id);
    if (result.cancelled) await createNotification(result.applicantId, "cancelled", "仲介案件が終了しました", "この案件は終了しました。", input.id);
    return { status: result.status };
  }),

  advanceToHandover: protectedProcedure.input(z.object({ id: mediationId })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const applicantId = await db.transaction(async tx => {
      const rows = await tx.select().from(mediations).where(eq(mediations.id, input.id)).for("update").limit(1);
      const caseRow = ensureParticipant(rows[0], ctx.user.id);
      await lockUserPair(tx, ctx.user.id, otherParty(caseRow, ctx.user.id));
      await ensureUnblocked(tx, ctx.user.id, otherParty(caseRow, ctx.user.id));
      if (caseRow.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "拾得物の投稿者だけが進捗を更新できます。" });
      if (caseRow.status !== "verification_in_progress") throw new TRPCError({ code: "BAD_REQUEST", message: "所有確認中の案件だけ次へ進めます。" });
      await tx.update(mediations).set({ status: "handover_discussion" }).where(eq(mediations.id, caseRow.id));
      return caseRow.applicantId;
    });
    await createNotification(applicantId, "status", "受け渡し方法を相談できます", "安全な公共の場所での受け渡しをアプリ内で相談してください。", input.id);
    return { status: "handover_discussion" };
  }),

  proposeHandover: protectedProcedure.input(z.object({
    id: mediationId,
    method: handoverMethod,
    place: z.string().trim().min(2).max(160),
    at: z.coerce.date().refine(date => date.getTime() > Date.now(), "受け渡し日時は未来を指定してください。"),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    if (/(?:自宅|個人宅|住所|部屋番号)/.test(input.place)) throw new TRPCError({ code: "BAD_REQUEST", message: "安全のため、自宅住所や個人宅ではなく公共施設・警察署/交番・施設受付を指定してください。" });
    safeMessage(input.place);
    if ((input.latitude == null) !== (input.longitude == null)) throw new TRPCError({ code: "BAD_REQUEST", message: "地図位置は緯度・経度を両方入力するか、両方空欄にしてください。" });
    const recipient = await db.transaction(async tx => {
      const rows = await tx.select().from(mediations).where(eq(mediations.id, input.id)).for("update").limit(1);
      const caseRow = ensureParticipant(rows[0], ctx.user.id);
      const recipientId = otherParty(caseRow, ctx.user.id);
      await lockUserPair(tx, ctx.user.id, recipientId);
      await ensureUnblocked(tx, ctx.user.id, recipientId);
      if (caseRow.status !== "handover_discussion") throw new TRPCError({ code: "BAD_REQUEST", message: "受け渡し相談中の案件だけ日時を提案できます。" });
      const ownerProposes = caseRow.ownerId === ctx.user.id;
      await tx.update(mediations).set({
        handoverMethod: input.method,
        handoverPlace: input.place,
        handoverAt: input.at,
        handoverLatitude: input.latitude ?? null,
        handoverLongitude: input.longitude ?? null,
        ownerAccepted: ownerProposes,
        applicantAccepted: !ownerProposes,
      }).where(eq(mediations.id, caseRow.id));
      return recipientId;
    });
    await createNotification(recipient, "handover", "受け渡し案が届きました", "場所と日時を確認し、同意するかアプリ内で相談してください。", input.id);
    return { proposed: true };
  }),

  acceptHandover: protectedProcedure.input(z.object({ id: mediationId })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const result = await db.transaction(async tx => {
      const rows = await tx.select().from(mediations).where(eq(mediations.id, input.id)).for("update").limit(1);
      const caseRow = ensureParticipant(rows[0], ctx.user.id);
      const recipient = otherParty(caseRow, ctx.user.id);
      await lockUserPair(tx, ctx.user.id, recipient);
      await ensureUnblocked(tx, ctx.user.id, recipient);
      if (caseRow.status !== "handover_discussion" || !caseRow.handoverAt || !caseRow.handoverPlace) throw new TRPCError({ code: "BAD_REQUEST", message: "受け渡し案がありません。" });
      const isOwner = caseRow.ownerId === ctx.user.id;
      const ownerAccepted = isOwner || caseRow.ownerAccepted;
      const applicantAccepted = !isOwner || caseRow.applicantAccepted;
      const status = ownerAccepted && applicantAccepted ? "handover_scheduled" as const : "handover_discussion" as const;
      await tx.update(mediations).set({ ownerAccepted, applicantAccepted, status }).where(eq(mediations.id, caseRow.id));
      return { recipient, status };
    });
    await createNotification(result.recipient, "handover", result.status === "handover_scheduled" ? "受け渡し日時が確定しました" : "受け渡し案への同意が記録されました", result.status === "handover_scheduled" ? "双方が同意しました。安全な場所で受け渡してください。" : "もう一方の同意を待っています。", input.id);
    return { status: result.status };
  }),

  confirmComplete: protectedProcedure.input(z.object({ id: mediationId })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const result = await db.transaction(async tx => {
      const rows = await tx.select().from(mediations).where(eq(mediations.id, input.id)).for("update").limit(1);
      const caseRow = ensureParticipant(rows[0], ctx.user.id);
      const recipient = otherParty(caseRow, ctx.user.id);
      await lockUserPair(tx, ctx.user.id, recipient);
      await ensureUnblocked(tx, ctx.user.id, recipient);
      if (caseRow.status !== "handover_scheduled") throw new TRPCError({ code: "BAD_REQUEST", message: "双方が合意した受け渡し予定が必要です。" });
      const isOwner = caseRow.ownerId === ctx.user.id;
      const ownerCompleted = isOwner || caseRow.ownerCompleted;
      const applicantCompleted = !isOwner || caseRow.applicantCompleted;
      const completed = ownerCompleted && applicantCompleted;
      await tx.update(mediations).set({ ownerCompleted, applicantCompleted, status: completed ? "handover_completed" : "handover_scheduled" }).where(eq(mediations.id, caseRow.id));
      return { completed, recipient };
    });
    await createNotification(result.recipient, "completion", result.completed ? "受け渡し完了が確認されました" : "受け渡し完了の確認が届きました", result.completed ? "双方の完了確認により案件を終了しました。" : "受け渡しが完了したら、案件管理で確認してください。", input.id);
    return { completed: result.completed };
  }),

  cancel: protectedProcedure.input(z.object({ id: mediationId, reason: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
    if (input.reason) safeMessage(input.reason);
    const db = await requireDatabase();
    const recipient = await db.transaction(async tx => {
      const rows = await tx.select().from(mediations).where(eq(mediations.id, input.id)).for("update").limit(1);
      const caseRow = ensureParticipant(rows[0], ctx.user.id);
      const other = otherParty(caseRow, ctx.user.id);
      await lockUserPair(tx, ctx.user.id, other);
      if (["handover_completed", "cancelled"].includes(caseRow.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "すでに終了している案件です。" });
      await tx.update(mediations).set({ status: "cancelled", decisionNote: input.reason || "" }).where(eq(mediations.id, caseRow.id));
      return other;
    });
    await createNotification(recipient, "cancelled", "仲介案件がキャンセルされました", "案件の進行は終了しました。", input.id);
    return { cancelled: true };
  }),

  blockCounterparty: protectedProcedure.input(z.object({ id: mediationId })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    await db.transaction(async tx => {
      const rows = await tx.select().from(mediations).where(eq(mediations.id, input.id)).for("update").limit(1);
      const caseRow = ensureParticipant(rows[0], ctx.user.id);
      const blockedId = otherParty(caseRow, ctx.user.id);
      await lockUserPair(tx, ctx.user.id, blockedId);
      const existing = await tx.select({ id: userBlocks.id }).from(userBlocks)
        .where(and(eq(userBlocks.blockerId, ctx.user.id), eq(userBlocks.blockedId, blockedId))).limit(1);
      if (!existing.length) await tx.insert(userBlocks).values({ blockerId: ctx.user.id, blockedId, sourcePostId: caseRow.postId, sourceMediationId: caseRow.id });
    });
    return { blocked: true };
  }),

  unblockUser: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "自分自身はブロック解除の対象にできません。" });
    const db = await requireDatabase();
    const result = await db.transaction(async tx => {
      await lockUserPair(tx, ctx.user.id, input.userId);
      return tx.delete(userBlocks).where(and(eq(userBlocks.blockerId, ctx.user.id), eq(userBlocks.blockedId, input.userId)));
    });
    return { unblocked: result[0].affectedRows > 0 };
  }),

  myBlocks: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    return db.select({ userId: userBlocks.blockedId, sourcePostTitle: foundPosts.title, createdAt: userBlocks.createdAt })
      .from(userBlocks).leftJoin(foundPosts, eq(userBlocks.sourcePostId, foundPosts.id))
      .where(eq(userBlocks.blockerId, ctx.user.id)).orderBy(desc(userBlocks.createdAt));
  }),

  submitCaseReport: protectedProcedure.input(z.object({
    id: mediationId,
    category: safetyReportCategory,
    details: z.string().trim().min(5).max(2000),
    confirmDisclosure: z.literal(true),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const rows = await db.select().from(mediations).where(eq(mediations.id, input.id)).limit(1);
    const caseRow = ensureParticipant(rows[0], ctx.user.id);
    return saveAndNotifySafetyReport({ db, reporterId: ctx.user.id, reportedUserId: otherParty(caseRow, ctx.user.id), mediationId: caseRow.id, postId: caseRow.postId, category: input.category, details: input.details });
  }),

  submitPostReport: protectedProcedure.input(z.object({
    postId: z.number().int().positive(),
    category: safetyReportCategory,
    details: z.string().trim().min(5).max(2000),
    confirmDisclosure: z.literal(true),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const rows = await db.select().from(foundPosts).where(and(eq(foundPosts.id, input.postId), eq(foundPosts.status, "active"))).limit(1);
    const post = rows[0];
    if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "この投稿は現在公開されていません。" });
    if (post.ownerId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "自分の投稿は通報できません。" });
    return saveAndNotifySafetyReport({ db, reporterId: ctx.user.id, reportedUserId: post.ownerId, mediationId: null, postId: post.id, category: input.category, details: input.details });
  }),

  report: protectedProcedure.input(z.object({
    id: mediationId,
    category: z.enum(["personal_information", "harassment", "fraud", "unsafe_handover", "other"]),
    details: z.string().trim().min(5).max(2000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const rows = await db.select().from(mediations).where(eq(mediations.id, input.id)).limit(1);
    ensureParticipant(rows[0], ctx.user.id);
    await db.insert(mediationReports).values({ mediationId: input.id, reporterId: ctx.user.id, category: input.category, details: input.details });
    return { saved: true, notice: "相談内容はこの案件内に保存されました。運営や公的機関へ自動送信されていません。緊急の場合は公的機関へ相談してください。" };
  }),
});
