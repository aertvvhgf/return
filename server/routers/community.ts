import { and, desc, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { mediations, userFollows, userReviews, users, foundPosts } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDatabase } from "../return-utils";

export const communityRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const [received, given, following, followers, recentReviews, eligibleRows, postRows, completedRows] = await Promise.all([
      db.select({ rating: userReviews.rating }).from(userReviews).where(eq(userReviews.revieweeId, ctx.user.id)),
      db.select({ rating: userReviews.rating }).from(userReviews).where(eq(userReviews.reviewerId, ctx.user.id)),
      db.select({ userId: userFollows.followingId, name: users.name, profileCode: users.profileCode }).from(userFollows).innerJoin(users, eq(users.id, userFollows.followingId)).where(eq(userFollows.followerId, ctx.user.id)).orderBy(desc(userFollows.createdAt)),
      db.select({ userId: userFollows.followerId }).from(userFollows).where(eq(userFollows.followingId, ctx.user.id)),
      db.select({ review: userReviews, reviewerName: users.name, reviewerCode: users.profileCode }).from(userReviews).innerJoin(users, eq(users.id, userReviews.reviewerId)).where(eq(userReviews.revieweeId, ctx.user.id)).orderBy(desc(userReviews.createdAt)).limit(20),
      db.select({ mediation: mediations, postTitle: foundPosts.title }).from(mediations).leftJoin(foundPosts, eq(foundPosts.id, mediations.postId)).where(and(or(eq(mediations.applicantId, ctx.user.id), eq(mediations.ownerId, ctx.user.id)), eq(mediations.status, "handover_completed"))).orderBy(desc(mediations.updatedAt)).limit(20),
      db.select({ id: foundPosts.id }).from(foundPosts).where(eq(foundPosts.ownerId, ctx.user.id)),
      db.select({ id: mediations.id }).from(mediations).where(and(or(eq(mediations.applicantId, ctx.user.id), eq(mediations.ownerId, ctx.user.id)), eq(mediations.status, "handover_completed"))),
    ]);
    const targetIds = eligibleRows.map(row => row.mediation.applicantId === ctx.user.id ? row.mediation.ownerId : row.mediation.applicantId);
    const targetRows = targetIds.length ? await db.select({ id: users.id, name: users.name, profileCode: users.profileCode }).from(users).where(or(...targetIds.map(id => eq(users.id, id)))) : [];
    const targetById = new Map(targetRows.map(row => [row.id, row]));
    const receivedCount = received.length;
    const points = postRows.length * 30 + completedRows.length * 100 + given.length * 15 + received.length * 20 + following.length * 3;
    const titles = [
      { id: "first-step", name: "はじめの一歩", description: "returnを使い始めた", requiredPoints: 0 },
      { id: "finder", name: "やさしい拾得者", description: "拾得物を1件投稿した", requiredPoints: 30 },
      { id: "return-rookie", name: "returnルーキー", description: "100ポイントを獲得した", requiredPoints: 100 },
      { id: "bridge-builder", name: "つなぐ人", description: "受け渡しを1件完了した", requiredPoints: 130 },
      { id: "trusted", name: "信頼の案内人", description: "評価を3件受け取った", requiredPoints: 300 },
      { id: "return-master", name: "返却マスター", description: "600ポイントを獲得した", requiredPoints: 600 },
      { id: "return-hero", name: "returnヒーロー", description: "1,200ポイントを獲得した", requiredPoints: 1200 },
    ].map(title => ({ ...title, unlocked: title.id === "finder" ? postRows.length >= 1 : title.id === "bridge-builder" ? completedRows.length >= 1 : title.id === "trusted" ? received.length >= 3 : points >= title.requiredPoints }));
    const level = Math.max(1, Math.floor(points / 100) + 1);
    const currentLevelStart = (level - 1) * 100;
    const nextLevelPoints = level * 100;
    return {
      points,
      level,
      levelProgress: Math.min(100, Math.round(((points - currentLevelStart) / 100) * 100)),
      nextLevelPoints,
      titles,
      receivedAverage: receivedCount ? Math.round((received.reduce((sum, row) => sum + row.rating, 0) / receivedCount) * 10) / 10 : 0,
      receivedCount,
      givenCount: given.length,
      following,
      followerCount: followers.length,
      reviews: recentReviews.map(row => ({ ...row.review, reviewerName: row.reviewerName || "匿名ユーザー", reviewerCode: row.reviewerCode })),
      eligible: eligibleRows.map(row => { const targetId = row.mediation.applicantId === ctx.user.id ? row.mediation.ownerId : row.mediation.applicantId; const target = targetById.get(targetId); return { mediationId: row.mediation.id, postTitle: row.postTitle || "拾得物の取引", targetId, targetName: target?.name || "取引相手", targetCode: target?.profileCode }; }),
    };
  }),
  follow: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "自分自身はフォローできません。" });
    const db = await requireDatabase();
    const target = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません。" });
    const existing = await db.select({ id: userFollows.id }).from(userFollows).where(and(eq(userFollows.followerId, ctx.user.id), eq(userFollows.followingId, input.userId))).limit(1);
    if (!existing[0]) await db.insert(userFollows).values({ followerId: ctx.user.id, followingId: input.userId });
    return { following: true };
  }),
  unfollow: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    await db.delete(userFollows).where(and(eq(userFollows.followerId, ctx.user.id), eq(userFollows.followingId, input.userId)));
    return { following: false };
  }),
  review: protectedProcedure.input(z.object({ mediationId: z.string().uuid(), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).default("") })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const rows = await db.select().from(mediations).where(and(eq(mediations.id, input.mediationId), or(eq(mediations.applicantId, ctx.user.id), eq(mediations.ownerId, ctx.user.id)), eq(mediations.status, "handover_completed"))).limit(1);
    const mediation = rows[0];
    if (!mediation) throw new TRPCError({ code: "FORBIDDEN", message: "受け渡し完了後の案件だけ評価できます。" });
    const revieweeId = mediation.applicantId === ctx.user.id ? mediation.ownerId : mediation.applicantId;
    const existing = await db.select({ id: userReviews.id }).from(userReviews).where(and(eq(userReviews.mediationId, input.mediationId), eq(userReviews.reviewerId, ctx.user.id))).limit(1);
    if (existing[0]) await db.update(userReviews).set({ rating: input.rating, comment: input.comment }).where(eq(userReviews.id, existing[0].id));
    else await db.insert(userReviews).values({ mediationId: input.mediationId, reviewerId: ctx.user.id, revieweeId, rating: input.rating, comment: input.comment });
    return { saved: true };
  }),
});
