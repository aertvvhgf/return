import { COOKIE_NAME } from "@shared/const";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { createLocalUser, getUserByEmail, getUserByOpenId } from "./db";
import { hashPassword, verifyPassword } from "./local-auth";
import { postsRouter } from "./routers/posts";
import { personalRouter } from "./routers/personal";
import { mediationRouter } from "./routers/mediation";
import { notificationsRouter } from "./routers/notifications";
import { guestSyncRouter } from "./routers/guestSync";
import { chatRouter } from "./routers/chat";
import { paypayRouter } from "./routers/paypay";
import { communityRouter } from "./routers/community";

const DEMO_ACCOUNT_EMAIL = "テストアカウント";
const LEGACY_DEMO_ACCOUNT_EMAIL = "TEST account";
const DEMO_ACCOUNT_PASSWORD = "1111";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      const user = opts.ctx.user;
      if (!user) return null;
      return {
        id: user.id,
        profileCode: user.profileCode,
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        phone: user.phone,
        kana: user.kana,
        settings: user.settings,
        createdAt: user.createdAt,
      };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    register: publicProcedure.input(z.object({
      name: z.string().trim().min(1, "名前を入力してください。").max(80),
      email: z.string().trim().toLowerCase().email("メールアドレスを確認してください。").max(320),
      password: z.string().min(8, "パスワードは8文字以上にしてください。").max(200),
    })).mutation(async ({ input, ctx }) => {
      const email = input.email.trim().toLowerCase();
      if (await getUserByEmail(email)) throw new TRPCError({ code: "CONFLICT", message: "このメールアドレスは既に登録されています。" });
      const user = await createLocalUser({ openId: `local_${randomUUID()}`, name: input.name.trim(), email, passwordHash: hashPassword(input.password) });
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "アカウントを作成できませんでした。" });
      const token = await sdk.createSessionToken(user.openId, { name: user.name ?? "" });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 365 * 24 * 60 * 60 * 1000 });
      return { success: true } as const;
    }),
    login: publicProcedure.input(z.object({
      email: z.string().trim().max(320).refine(value => value === DEMO_ACCOUNT_EMAIL || value === LEGACY_DEMO_ACCOUNT_EMAIL || z.string().email().safeParse(value.toLowerCase()).success, "メールアドレスを確認してください。"),
      password: z.string().min(1, "パスワードを入力してください.").max(200),
    })).mutation(async ({ input, ctx }) => {
      const requestedEmail = input.email.trim();
      const isDemoAccount = requestedEmail === DEMO_ACCOUNT_EMAIL || requestedEmail === LEGACY_DEMO_ACCOUNT_EMAIL;
      if (isDemoAccount && input.password !== DEMO_ACCOUNT_PASSWORD) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "メールアドレスまたはパスワードが正しくありません。" });
      }
      let user = await getUserByEmail(isDemoAccount ? DEMO_ACCOUNT_EMAIL.toLowerCase() : requestedEmail.toLowerCase());
      if (isDemoAccount && !user) user = await getUserByOpenId("local_shared_demo");
      if (isDemoAccount && !user) {
        user = await createLocalUser({ openId: "local_shared_demo", name: DEMO_ACCOUNT_EMAIL, email: DEMO_ACCOUNT_EMAIL.toLowerCase(), passwordHash: hashPassword(DEMO_ACCOUNT_PASSWORD) });
      }
      if (!user?.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "メールアドレスまたはパスワードが正しくありません。" });
      }
      const token = await sdk.createSessionToken(user.openId, { name: user.name ?? "" });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 365 * 24 * 60 * 60 * 1000 });
      return { success: true } as const;
    }),
  }),
  posts: postsRouter,
  personal: personalRouter,
  mediation: mediationRouter,
  notifications: notificationsRouter,
  guestSync: guestSyncRouter,
  chat: chatRouter,
  paypay: paypayRouter,
  community: communityRouter,
});

export type AppRouter = typeof appRouter;
