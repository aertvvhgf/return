import { and, desc, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { mediations, rewardRequests } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { requireDatabase } from "../return-utils";

const mediationId = z.string().uuid();

export const paypayRouter = router({
  listForMediation: protectedProcedure.input(z.object({ mediationId })).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [caseRow] = await db.select().from(mediations).where(and(eq(mediations.id, input.mediationId), or(eq(mediations.ownerId, ctx.user.id), eq(mediations.applicantId, ctx.user.id)))).limit(1);
    if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "仲介案件が見つかりません。" });
    return db.select({ id: rewardRequests.id, amountJpy: rewardRequests.amountJpy, status: rewardRequests.status, provider: rewardRequests.provider, createdAt: rewardRequests.createdAt, updatedAt: rewardRequests.updatedAt })
      .from(rewardRequests).where(eq(rewardRequests.mediationId, input.mediationId)).orderBy(desc(rewardRequests.createdAt));
  }),
  createRequest: protectedProcedure.input(z.object({ mediationId, amountJpy: z.number().int().min(100).max(100000) })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [caseRow] = await db.select().from(mediations).where(and(eq(mediations.id, input.mediationId), eq(mediations.applicantId, ctx.user.id))).limit(1);
    if (!caseRow) throw new TRPCError({ code: "FORBIDDEN", message: "謝礼を提案できるのは仲介申請者です。" });
    const id = crypto.randomUUID();
    await db.insert(rewardRequests).values({ id, mediationId: input.mediationId, payerId: caseRow.applicantId, recipientId: caseRow.ownerId, amountJpy: input.amountJpy, status: "draft", provider: "paypay" });
    return { id, status: "draft" as const, message: "謝礼案を作成しました。PayPay加盟店連携が完了するまで外部送金は発生しません。" };
  }),
  agree: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [row] = await db.select().from(rewardRequests).where(eq(rewardRequests.id, input.id)).limit(1);
    if (!row || row.payerId !== ctx.user.id && row.recipientId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND", message: "謝礼案が見つかりません。" });
    await db.update(rewardRequests).set({ status: "agreed" }).where(eq(rewardRequests.id, row.id));
    return { status: "agreed" as const };
  }),
  startPayment: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const [row] = await db.select().from(rewardRequests).where(and(eq(rewardRequests.id, input.id), eq(rewardRequests.payerId, ctx.user.id))).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "謝礼案が見つかりません。" });
    // Production PayPay OPA credentials are intentionally not present in this environment.
    await db.update(rewardRequests).set({ status: "unavailable" }).where(eq(rewardRequests.id, row.id));
    return { status: "unavailable" as const, message: "PayPayの加盟店契約・API認証情報が未設定のため、支払いは開始されませんでした。" };
  }),
});
