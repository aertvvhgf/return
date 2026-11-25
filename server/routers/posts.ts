import { and, desc, eq, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { foundPosts, lostItems, mediations } from "../../drizzle/schema";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { createNotification, normalizeText, publicFoundPost, requireDatabase, scoreMatch, textSimilarity } from "../return-utils";
import { rankWithAi } from "../ai-match";
import { reviewFoundImage } from "../image-review";
import { findSensitiveInformation } from "../privacy";
import { isValidStoredImageDataUrl, isValidTransientImageDataUrl, sanitizeJpegDataUrl } from "../image-data";
import { reviewFoundImageDataUrl } from "../image-review";
import { storagePut } from "../storage";
import { getInteractingBlockedIds } from "../blocking";
import { analyzePhotoForPost } from "../photo-autofill";

const aiMatchUsage = new Map<number, { startedAt: number; count: number }>();
function canUseAiMatch(userId: number) {
  const now = Date.now();
  const current = aiMatchUsage.get(userId);
  if (!current || now - current.startedAt >= 60_000) {
    aiMatchUsage.set(userId, { startedAt: now, count: 1 });
    if (aiMatchUsage.size > 5000) for (const [id, usage] of aiMatchUsage) if (now - usage.startedAt > 60_000) aiMatchUsage.delete(id);
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
}

export const categories = ["wallet", "device", "keys", "daily", "bag", "clothing", "documents", "other"] as const;
export const facilityTypes = ["rail", "police", "bus", "commercial", "community", "other"] as const;

const postInput = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.enum(categories),
  facilityType: z.enum(facilityTypes),
  color: z.string().trim().min(1).max(80),
  shape: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(3000),
  foundAt: z.coerce.date(),
  storageUntil: z.coerce.date().nullable().optional(),
  placeLabel: z.string().trim().min(1).max(200),
  deliveredTo: z.string().trim().min(1).max(200),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  photoDataUrl: z.string().max(7_500_000).optional(),
  photoStorageConsent: z.boolean().default(false),
  photoConsent: z.boolean().default(false),
  privateClues: z.string().trim().min(10).max(2000),
}).superRefine((post, ctx) => {
  for (const key of ["title", "color", "shape", "description", "placeLabel", "deliveredTo", "privateClues"] as const) {
    if (findSensitiveInformation(post[key]).length) {
      const message = key === "privateClues"
        ? "非公開メモにも氏名、連絡先、詳細住所、SNS ID、カード番号などを記載しないでください。"
        : "投稿情報に氏名、連絡先、詳細住所、SNS ID、カード番号などを記載しないでください。";
      ctx.addIssue({ code: "custom", path: [key], message });
    }
  }
  if (post.photoDataUrl && post.imageUrl) ctx.addIssue({ code: "custom", path: ["photoDataUrl"], message: "保存済み写真と新しい写真を同時に指定できません。" });
  if (post.photoDataUrl && !isValidStoredImageDataUrl(post.photoDataUrl)) ctx.addIssue({ code: "custom", path: ["photoDataUrl"], message: "写真を読み取れません。画面からJPEG・PNG・WebPを選び直してください。" });
  if ((post.imageUrl || post.photoDataUrl) && !post.photoStorageConsent) ctx.addIssue({ code: "custom", path: ["photoStorageConsent"], message: "写真の保存にはManus Storageへのアップロード同意が必要です。" });
  if ((post.imageUrl || post.photoDataUrl) && !post.photoConsent) ctx.addIssue({ code: "custom", path: ["photoConsent"], message: "写真の保存にはManus AI確認と公開への同意が必要です。" });
});

const matchInput = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.enum(categories),
  details: z.string().trim().max(3000).default(""),
  location: z.string().trim().max(200).default(""),
  route: z.string().trim().max(200).optional(),
  photoFeatures: z.string().trim().max(1200).optional(),
  lostAt: z.coerce.date().optional(),
  photoConsent: z.boolean().default(false),
  photoDataUrl: z.string().max(5_800_000).optional(),
}).superRefine((input, ctx) => {
  if (input.photoDataUrl && !input.photoConsent) ctx.addIssue({ code: "custom", path: ["photoConsent"], message: "写真をManus AIへ送るには、画面上で明示同意してください。" });
  if (input.photoDataUrl && !isValidTransientImageDataUrl(input.photoDataUrl)) ctx.addIssue({ code: "custom", path: ["photoDataUrl"], message: "写真を読み取れません。JPEG・PNG・WebP画像を選び直してください。" });
});

export const postsRouter = router({
  analyzePhoto: protectedProcedure.input(z.object({ photoDataUrl: z.string().max(7_500_000) })).mutation(async ({ input }) => {
    const result = await analyzePhotoForPost(input.photoDataUrl);
    if (!result) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "写真をAIで解析できませんでした。写真を確認して、もう一度お試しください。" });
    return result;
  }),
  search: publicProcedure.input(z.object({
    query: z.string().trim().max(200).optional(),
    route: z.string().trim().max(200).optional(),
    category: z.enum(categories).optional(),
    facilityType: z.enum(facilityTypes).optional(),
    sort: z.enum(["relevance", "recent", "oldest"]).default("relevance"),
    limit: z.number().int().min(1).max(200).default(100),
  })).query(async ({ input, ctx }) => {
    const db = await requireDatabase();
    const blockedUserIds = ctx.user ? await getInteractingBlockedIds(db, ctx.user.id) : new Set<number>();
    const rows = await db.select().from(foundPosts)
      .where(eq(foundPosts.status, "active"))
      .orderBy(desc(foundPosts.createdAt))
      .limit(500);
    const query = normalizeText(input.query);
    const filtered = rows.filter(post => !blockedUserIds.has(post.ownerId)).filter(post => {
      if (input.category && post.category !== input.category) return false;
      if (input.facilityType && post.facilityType !== input.facilityType) return false;
      if (input.route) {
        const requestedRoute = normalizeText(input.route);
        const routeText = normalizeText(`${post.placeLabel} ${post.deliveredTo} ${post.description}`);
        if (!routeText.includes(requestedRoute)) return false;
      }
      if (!query) return true;
      const searchable = normalizeText(`${post.title} ${post.color} ${post.shape} ${post.description} ${post.placeLabel} ${post.deliveredTo}`);
      return searchable.includes(query) || textSimilarity(input.query ?? "", searchable) >= 0.02;
    }).map(post => {
      const relevance = query ? Math.round(textSimilarity(input.query ?? "", `${post.title} ${post.color} ${post.shape} ${post.description} ${post.placeLabel}`) * 100) : 0;
      return { ...publicFoundPost(post), isMine: ctx.user?.id === post.ownerId, relevance };
    });
    if (input.sort === "recent") filtered.sort((a, b) => b.foundAt.getTime() - a.foundAt.getTime());
    else if (input.sort === "oldest") filtered.sort((a, b) => a.foundAt.getTime() - b.foundAt.getTime());
    else filtered.sort((a, b) => b.relevance - a.relevance || b.foundAt.getTime() - a.foundAt.getTime());
    return filtered.slice(0, input.limit);
  }),

  map: publicProcedure.input(z.object({ category: z.enum(categories).optional(), facilityType: z.enum(facilityTypes).optional() })).query(async ({ input, ctx }) => {
    const db = await requireDatabase();
    const blockedUserIds = ctx.user ? await getInteractingBlockedIds(db, ctx.user.id) : new Set<number>();
    const rows = await db.select().from(foundPosts)
      .where(eq(foundPosts.status, "active"))
      .orderBy(desc(foundPosts.createdAt))
      .limit(300);
    return rows.filter(post => !blockedUserIds.has(post.ownerId) && (!input.category || post.category === input.category) && (!input.facilityType || post.facilityType === input.facilityType))
      .filter(post => post.latitude != null && post.longitude != null)
      .map(post => ({ ...publicFoundPost(post), isMine: ctx.user?.id === post.ownerId }));
  }),

  detail: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input, ctx }) => {
    const db = await requireDatabase();
    const rows = await db.select().from(foundPosts).where(and(eq(foundPosts.id, input.id), eq(foundPosts.status, "active"))).limit(1);
    const post = rows[0];
    if (!post) return null;
    if (ctx.user && (await getInteractingBlockedIds(db, ctx.user.id)).has(post.ownerId)) return null;
    return { ...publicFoundPost(post), isMine: ctx.user?.id === post.ownerId };
  }),

  mine: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    return db.select().from(foundPosts).where(and(eq(foundPosts.ownerId, ctx.user.id), ne(foundPosts.status, "deleted"))).orderBy(desc(foundPosts.updatedAt));
  }),

  create: protectedProcedure.input(postInput).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    if ((input.latitude == null) !== (input.longitude == null)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "緯度と経度は両方入力するか、両方空欄にしてください。" });
    }
    let imageUrl = input.imageUrl ?? null;
    if (input.imageUrl) await reviewFoundImage(input.imageUrl, ctx.user.id);
    if (input.photoDataUrl) {
      const safeDataUrl = sanitizeJpegDataUrl(input.photoDataUrl, 5 * 1024 * 1024);
      if (!safeDataUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "写真のJPEG形式・サイズを確認できませんでした。写真を選び直してください。" });
      await reviewFoundImageDataUrl(safeDataUrl, ctx.user.id);
      try {
        const bytes = Buffer.from(safeDataUrl.slice(safeDataUrl.indexOf(",") + 1), "base64");
        const stored = await storagePut(`return/${ctx.user.id}/post-${crypto.randomUUID()}.jpg`, bytes, "image/jpeg");
        imageUrl = stored.url;
      } catch {
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "写真を安全に保存できませんでした。写真なしで投稿するか、時間をおいてください。" });
      }
    }
    const { photoConsent, photoStorageConsent, photoDataUrl, imageUrl: _inputImageUrl, ...postValues } = input;
    void photoStorageConsent;
    void photoDataUrl;
    void _inputImageUrl;
    const created = await db.insert(foundPosts).values({
      ownerId: ctx.user.id,
      ...postValues,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      imageUrl,
      photoConsentAt: imageUrl && photoConsent ? new Date() : null,
    }).$returningId();
    const postId = created[0]?.id;
    if (postId) {
      const [newPostRows, activeLost] = await Promise.all([
        db.select().from(foundPosts).where(eq(foundPosts.id, postId)).limit(1),
        db.select().from(lostItems).where(eq(lostItems.isActive, true)).limit(300),
      ]);
      const blockedUserIds = await getInteractingBlockedIds(db, ctx.user.id);
      const insertedPost = newPostRows[0];
      for (const lost of activeLost) {
        if (lost.userId === ctx.user.id || blockedUserIds.has(lost.userId) || !insertedPost) continue;
        const score = scoreMatch({ title: lost.title, category: lost.category, details: lost.details, location: lost.location, route: lost.route, lostAt: lost.lostAt }, insertedPost);
        if (score.score >= 38) await createNotification(lost.userId, "match", "紛失物に似た拾得投稿があります", `${input.title} と似た特徴の投稿が追加されました。候補として内容を確認してください。`);
      }
    }
    return { id: postId };
  }),

  update: protectedProcedure.input(z.object({ id: z.number().int().positive(), values: postInput })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const existing = await db.select({ id: foundPosts.id, status: foundPosts.status, imageUrl: foundPosts.imageUrl, photoConsentAt: foundPosts.photoConsentAt }).from(foundPosts)
      .where(and(eq(foundPosts.id, input.id), eq(foundPosts.ownerId, ctx.user.id))).limit(1);
    if (!existing[0] || existing[0].status === "deleted") return { updated: false };
    if ((input.values.latitude == null) !== (input.values.longitude == null)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "緯度と経度は両方入力するか、両方空欄にしてください。" });
    }
    if (input.values.imageUrl && !input.values.photoStorageConsent) throw new TRPCError({ code: "BAD_REQUEST", message: "写真を保存するにはManus Storageへのアップロードに同意してください。" });
    let imageUrl = input.values.imageUrl ?? null;
    if (input.values.photoDataUrl) {
      const safeDataUrl = sanitizeJpegDataUrl(input.values.photoDataUrl, 5 * 1024 * 1024);
      if (!safeDataUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "写真のJPEG形式・サイズを確認できませんでした。写真を選び直してください。" });
      await reviewFoundImageDataUrl(safeDataUrl, ctx.user.id);
      try {
        const bytes = Buffer.from(safeDataUrl.slice(safeDataUrl.indexOf(",") + 1), "base64");
        const stored = await storagePut(`return/${ctx.user.id}/post-${crypto.randomUUID()}.jpg`, bytes, "image/jpeg");
        imageUrl = stored.url;
      } catch {
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "写真を安全に保存できませんでした。写真なしで投稿するか、時間をおいてください." });
      }
    }
    const photoNeedsReview = Boolean(imageUrl && (imageUrl !== existing[0].imageUrl || !existing[0].photoConsentAt));
    if (photoNeedsReview && !input.values.photoConsent) throw new TRPCError({ code: "BAD_REQUEST", message: "新しい写真を公開するには画像AI確認と公開の両方に同意してください。" });
    if (photoNeedsReview && imageUrl && !input.values.photoDataUrl) await reviewFoundImage(imageUrl, ctx.user.id);
    const { photoConsent, photoStorageConsent, photoDataUrl, imageUrl: _inputImageUrl, ...postValues } = input.values;
    void photoStorageConsent;
    void photoDataUrl;
    void _inputImageUrl;
    await db.update(foundPosts).set({ ...postValues, latitude: input.values.latitude ?? null, longitude: input.values.longitude ?? null, imageUrl, photoConsentAt: imageUrl ? (photoNeedsReview && photoConsent ? new Date() : existing[0].photoConsentAt) : null })
      .where(and(eq(foundPosts.id, input.id), eq(foundPosts.ownerId, ctx.user.id)));
    return { updated: true };
  }),

  archive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const owned = await db.select({ id: foundPosts.id }).from(foundPosts)
      .where(and(eq(foundPosts.id, input.id), eq(foundPosts.ownerId, ctx.user.id), ne(foundPosts.status, "deleted"))).limit(1);
    if (!owned[0]) return { archived: false };
    const openCases = await db.select({ id: mediations.id }).from(mediations)
      .where(and(eq(mediations.postId, input.id), ne(mediations.status, "cancelled"), ne(mediations.status, "handover_completed"))).limit(1);
    if (openCases.length) throw new TRPCError({ code: "CONFLICT", message: "進行中の仲介案件があるため投稿を削除できません。先に案件管理からキャンセルまたは終了してください。" });
    const result = await db.update(foundPosts).set({ status: "deleted" })
      .where(and(eq(foundPosts.id, input.id), eq(foundPosts.ownerId, ctx.user.id), ne(foundPosts.status, "deleted")));
    return { archived: result[0].affectedRows > 0 };
  }),

  resolve: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const result = await db.update(foundPosts).set({ status: "resolved" })
      .where(and(eq(foundPosts.id, input.id), eq(foundPosts.ownerId, ctx.user.id), eq(foundPosts.status, "active")));
    return { resolved: result[0].affectedRows > 0 };
  }),

  match: publicProcedure.input(matchInput).mutation(async ({ input, ctx }) => {
    if (input.photoDataUrl && !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Manus AIへ写真を送って照合するにはログインが必要です。" });
    const db = await requireDatabase();
    const blockedUserIds = ctx.user ? await getInteractingBlockedIds(db, ctx.user.id) : new Set<number>();
    const rows = (await db.select().from(foundPosts).where(eq(foundPosts.status, "active")).orderBy(desc(foundPosts.createdAt)).limit(500))
      .filter(post => !blockedUserIds.has(post.ownerId));
    const compareInput = { ...input, details: input.photoFeatures ? `${input.details} ${input.photoFeatures}` : input.details };
    const localRanked = rows.map(post => ({ post, match: scoreMatch(compareInput, post) }))
      .sort((a, b) => b.match.score - a.match.score || b.post.foundAt.getTime() - a.post.foundAt.getTime());
    const aiAllowed = Boolean(ctx.user && localRanked.length && canUseAiMatch(ctx.user.id));
    const aiRanks = aiAllowed ? await rankWithAi(input, localRanked.slice(0, 30).map(row => row.post)) : null;
    const byId = new Map(rows.map(post => [post.id, post]));
    const candidates = aiRanks
      ? aiRanks.map(result => {
          const post = byId.get(result.id)!;
          return { ...publicFoundPost(post), isMine: ctx.user?.id === post.ownerId, matchScore: result.score, matchedFeatures: result.matchedFeatures };
        })
      : localRanked.filter(row => row.match.score >= 8).slice(0, 20).map(({ post, match }) => ({ ...publicFoundPost(post), isMine: ctx.user?.id === post.ownerId, matchScore: match.score, matchedFeatures: match.matchedFeatures }));
    const method = !localRanked.length ? "empty" as const : aiRanks ? "ai" as const : !ctx.user ? "guest" as const : aiAllowed ? "similarity" as const : "limit" as const;
    return { candidates, method, searchedAt: new Date() };
  }),
});
