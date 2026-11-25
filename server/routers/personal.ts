import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { foundPosts, lossReports, lostItems, savedSearches, users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { publicFoundPost, requireDatabase, safeJson, scoreMatch } from "../return-utils";
import { getInteractingBlockedIds } from "../blocking";
import { categories, facilityTypes } from "./posts";

const settingsInput = z.object({
  maskPersonalInfo: z.boolean(),
  highContrast: z.boolean(),
  fontScale: z.enum(["normal", "large", "extra-large"]),
  reduceMotion: z.boolean(),
  language: z.enum(["ja", "en", "zh", "ko"]),
  themeColor: z.enum(["teal", "blue", "purple", "rose", "amber", "slate"]),
});
const lostInput = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.enum(categories),
  details: z.string().trim().min(1).max(3000),
  lostAt: z.coerce.date().nullable().optional(),
  location: z.string().trim().min(1).max(200),
  route: z.string().trim().max(200).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
});
const reportInput = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40),
  itemName: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  details: z.string().trim().min(1).max(3000),
  lostAt: z.coerce.date().nullable().optional(),
  location: z.string().trim().min(1).max(200),
  route: z.string().trim().max(200).nullable().optional(),
  destinations: z.array(z.string().trim().min(1).max(120)).max(10),
});
const searchInput = z.object({
  label: z.string().trim().min(1).max(80),
  query: z.string().trim().max(200),
  category: z.enum(categories).nullable().optional(),
  facilityType: z.enum(facilityTypes).nullable().optional(),
  route: z.string().trim().max(200).nullable().optional(),
});

export const personalRouter = router({
  profile: router({
    update: protectedProcedure.input(z.object({
      name: z.string().trim().max(120).nullable().optional(),
      phone: z.string().trim().max(40).nullable().optional(),
      kana: z.string().trim().max(120).nullable().optional(),
      settings: settingsInput.optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const changes: Partial<typeof users.$inferInsert> = {};
      if (input.name !== undefined) changes.name = input.name || null;
      if (input.phone !== undefined) changes.phone = input.phone || null;
      if (input.kana !== undefined) changes.kana = input.kana || null;
      if (input.settings !== undefined) changes.settings = JSON.stringify(input.settings);
      if (Object.keys(changes).length === 0) return { saved: true };
      await db.update(users).set(changes).where(eq(users.id, ctx.user.id));
      return { saved: true };
    }),
    settings: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const rows = await db.select({ settings: users.settings }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      return safeJson(rows[0]?.settings, {
        maskPersonalInfo: true,
        highContrast: false,
        fontScale: "normal" as const,
        reduceMotion: false,
        language: "ja" as const,
        themeColor: "teal" as const,
      });
    }),
  }),

  lost: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      return db.select().from(lostItems).where(eq(lostItems.userId, ctx.user.id)).orderBy(desc(lostItems.updatedAt));
    }),
    create: protectedProcedure.input(lostInput).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const inserted = await db.insert(lostItems).values({
        userId: ctx.user.id,
        ...input,
        lostAt: input.lostAt ?? null,
        route: input.route || null,
        imageUrl: input.imageUrl || null,
        isActive: true,
      }).$returningId();
      return { id: inserted[0]?.id };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), values: lostInput })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const result = await db.update(lostItems).set({
        ...input.values,
        lostAt: input.values.lostAt ?? null,
        route: input.values.route || null,
        imageUrl: input.values.imageUrl || null,
      }).where(and(eq(lostItems.id, input.id), eq(lostItems.userId, ctx.user.id)));
      return { updated: result[0].affectedRows > 0 };
    }),
    setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const result = await db.update(lostItems).set({ isActive: input.active }).where(and(eq(lostItems.id, input.id), eq(lostItems.userId, ctx.user.id)));
      return { updated: result[0].affectedRows > 0 };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const result = await db.delete(lostItems).where(and(eq(lostItems.id, input.id), eq(lostItems.userId, ctx.user.id)));
      return { deleted: result[0].affectedRows > 0 };
    }),
    matches: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const itemRows = await db.select().from(lostItems).where(and(eq(lostItems.id, input.id), eq(lostItems.userId, ctx.user.id))).limit(1);
      const item = itemRows[0];
      if (!item) return [];
      const blockedUserIds = await getInteractingBlockedIds(db, ctx.user.id);
      const posts = (await db.select().from(foundPosts).where(eq(foundPosts.status, "active")).orderBy(desc(foundPosts.createdAt)).limit(300))
        .filter(post => !blockedUserIds.has(post.ownerId));
      return posts.map(post => {
        const match = scoreMatch({ title: item.title, category: item.category, details: item.details, location: item.location, route: item.route, lostAt: item.lostAt }, post);
        return { ...publicFoundPost(post), isMine: post.ownerId === ctx.user.id, score: match.score, matchedFeatures: match.matchedFeatures };
      })
        .filter(post => post.score >= 8).sort((a, b) => b.score - a.score).slice(0, 10);
    }),
  }),

  savedSearches: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      return db.select().from(savedSearches).where(eq(savedSearches.userId, ctx.user.id)).orderBy(desc(savedSearches.createdAt));
    }),
    create: protectedProcedure.input(searchInput).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const created = await db.insert(savedSearches).values({
        userId: ctx.user.id,
        label: input.label,
        query: input.query,
        category: input.category ?? null,
        facilityType: input.facilityType ?? null,
        route: input.route || null,
      }).$returningId();
      return { id: created[0]?.id };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const result = await db.delete(savedSearches).where(and(eq(savedSearches.id, input.id), eq(savedSearches.userId, ctx.user.id)));
      return { deleted: result[0].affectedRows > 0 };
    }),
  }),

  reports: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const rows = await db.select().from(lossReports).where(eq(lossReports.userId, ctx.user.id)).orderBy(desc(lossReports.updatedAt));
      return rows.map(({ destinations, ...report }) => ({ ...report, destinations: safeJson<string[]>(destinations, []) }));
    }),
    create: protectedProcedure.input(reportInput).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const created = await db.insert(lossReports).values({
        userId: ctx.user.id,
        ...input,
        lostAt: input.lostAt ?? null,
        route: input.route || null,
        destinations: JSON.stringify(input.destinations),
      }).$returningId();
      return { id: created[0]?.id };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), values: reportInput })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const result = await db.update(lossReports).set({
        ...input.values,
        lostAt: input.values.lostAt ?? null,
        route: input.values.route || null,
        destinations: JSON.stringify(input.values.destinations),
      }).where(and(eq(lossReports.id, input.id), eq(lossReports.userId, ctx.user.id)));
      return { updated: result[0].affectedRows > 0 };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const result = await db.delete(lossReports).where(and(eq(lossReports.id, input.id), eq(lossReports.userId, ctx.user.id)));
      return { deleted: result[0].affectedRows > 0 };
    }),
  }),
});
