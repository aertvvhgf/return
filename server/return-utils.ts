import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { notificationPreferences, notifications, type foundPosts } from "../drizzle/schema";
import { redactSensitiveInformation } from "./privacy";

export type FoundPost = typeof foundPosts.$inferSelect;
export type NoticeKind = "application" | "decision" | "status" | "message" | "handover" | "completion" | "cancelled" | "match" | "chat";

export async function requireDatabase() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "データベースに接続できません。時間をおいて再度お試しください。" });
  }
  return db;
}

export function publicFoundPost(post: FoundPost) {
  const { privateClues: _privateClues, ownerId: _ownerId, latitude, longitude, photoConsentAt: _photoConsentAt, imageUrl, ...publicFields } = post;
  return {
    ...publicFields,
    title: redactSensitiveInformation(post.title),
    color: redactSensitiveInformation(post.color),
    shape: redactSensitiveInformation(post.shape),
    description: redactSensitiveInformation(post.description),
    placeLabel: redactSensitiveInformation(post.placeLabel),
    deliveredTo: redactSensitiveInformation(post.deliveredTo),
    // Do not expose the owner-scoped storage key in the public API response.
    imageUrl: imageUrl ? `/api/public/found-photo/${post.id}` : null,
    // Public map locations are rounded to roughly kilometer-scale cells.
    latitude: latitude == null ? null : Math.round(latitude * 100) / 100,
    longitude: longitude == null ? null : Math.round(longitude * 100) / 100,
  };
}

export function normalizeText(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/[\s　・。、．,，!！?？:：;；/／\\_-]+/g, "").trim();
}

function textUnits(value: string | null | undefined) {
  const normalized = normalizeText(value);
  const units = new Set<string>();
  for (const word of (value ?? "").normalize("NFKC").toLocaleLowerCase("ja-JP").split(/[\s　・。、．,，!！?？:：;；/／\\_-]+/)) {
    if (word.length > 1) units.add(word);
  }
  const chars = Array.from(normalized);
  if (chars.length === 1) units.add(chars[0]);
  for (let i = 0; i < chars.length - 1; i += 1) units.add(chars[i] + chars[i + 1]);
  return units;
}

export function textSimilarity(a: string, b: string) {
  const left = textUnits(a);
  const right = textUnits(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const unit of left) if (right.has(unit)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export function scoreMatch(input: {
  title: string;
  category: string;
  details: string;
  location: string;
  route?: string | null;
  lostAt?: Date | null;
}, post: FoundPost) {
  const matchedFeatures: string[] = [];
  let score = 0;
  if (input.category === post.category) {
    score += 26;
    matchedFeatures.push("カテゴリ");
  }
  const contentScore = textSimilarity(`${input.title} ${input.details}`, `${post.title} ${post.color} ${post.shape} ${post.description}`);
  if (contentScore >= 0.12) matchedFeatures.push("品名・特徴");
  score += Math.min(38, contentScore * 55);
  const locationText = `${input.location} ${input.route ?? ""}`;
  const postLocation = `${post.placeLabel} ${post.deliveredTo}`;
  const locationScore = textSimilarity(locationText, postLocation);
  if (locationScore >= 0.12) matchedFeatures.push("場所");
  score += Math.min(18, locationScore * 42);
  if (input.lostAt) {
    const hours = Math.abs(input.lostAt.getTime() - post.foundAt.getTime()) / 3_600_000;
    const timeScore = Math.max(0, 18 - (hours / (24 * 14)) * 18);
    if (timeScore > 5) matchedFeatures.push("日時");
    score += timeScore;
  }
  return { score: Math.round(Math.min(99, score)), matchedFeatures };
}

export async function createNotification(
  userId: number,
  kind: NoticeKind,
  title: string,
  summary: string,
  mediationId?: string | null,
  threadId?: string | null,
) {
  const db = await requireDatabase();
  const preference = await db.select({ enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.kind, kind)))
    .limit(1);
  if (preference[0]?.enabled === false) return;
  await db.insert(notifications).values({
    userId,
    kind,
    title: title.slice(0, 120),
    summary: summary.slice(0, 300),
    mediationId: mediationId ?? null,
    threadId: threadId ?? null,
  });
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
