/**
 * Opt-in integration test for the chat API against a real MySQL database.
 * Run with: CHAT_E2E=1 DATABASE_URL=mysql://... pnpm vitest run server/chat.e2e.test.ts
 * It writes throwaway rows, so it never runs as part of the default `pnpm test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";

const enabled = process.env.CHAT_E2E === "1" && Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("chat API", () => {
  let db: Awaited<ReturnType<typeof import("./db").getDb>>;
  let appRouter: typeof import("./routers").appRouter;
  let caller: (userId: number) => ReturnType<typeof buildCaller>;
  const createdUserIds: number[] = [];
  const createdPostIds: number[] = [];
  let ownerId = 0;
  let applicantId = 0;
  let thirdId = 0;
  let postId = 0;

  function buildCaller(userId: number) {
    const ctx = {
      user: { id: userId, openId: `chat-e2e-${userId}`, name: `テスト${userId}`, email: null, loginMethod: "test", role: "user" },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as unknown as TrpcContext;
    return appRouter.createCaller(ctx);
  }

  beforeAll(async () => {
    const [{ getDb }, schema, routers] = await Promise.all([
      import("./db"),
      import("../drizzle/schema"),
      import("./routers"),
    ]);
    appRouter = routers.appRouter;
    db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required");
    const stamp = Date.now();
    for (const label of ["owner", "applicant", "third"]) {
      const inserted = await db.insert(schema.users).values({ openId: `chat-e2e-${label}-${stamp}`, name: `E2E ${label}` });
      createdUserIds.push(Number(inserted[0].insertId));
    }
    [ownerId, applicantId, thirdId] = createdUserIds;
    const post = await db.insert(schema.foundPosts).values({
      ownerId,
      title: "E2E 黒い財布",
      category: "wallet",
      facilityType: "rail",
      color: "黒",
      shape: "二つ折り",
      description: "E2Eテスト用の投稿",
      foundAt: new Date(),
      placeLabel: "E2E駅",
      deliveredTo: "E2E駅係員",
      privateClues: "内側の傷",
    });
    postId = Number(post[0].insertId);
    createdPostIds.push(postId);
    // The third user becomes a contact through a mediation case.
    await db.insert(schema.mediations).values({
      id: crypto.randomUUID(),
      postId,
      applicantId: thirdId,
      ownerId,
      evidence: "E2Eの所有確認情報です",
      status: "application_pending",
    });
    caller = (userId: number) => buildCaller(userId);
  });

  afterAll(async () => {
    if (!db) return;
    const schema = await import("../drizzle/schema");
    const { inArray, eq } = await import("drizzle-orm");
    const threads = await db.select({ id: schema.chatThreads.id }).from(schema.chatThreads).where(eq(schema.chatThreads.createdBy, applicantId));
    const threadIds = threads.map(row => row.id);
    if (threadIds.length) {
      await db.delete(schema.chatMessages).where(inArray(schema.chatMessages.threadId, threadIds));
      await db.delete(schema.chatMembers).where(inArray(schema.chatMembers.threadId, threadIds));
      await db.delete(schema.chatThreads).where(inArray(schema.chatThreads.id, threadIds));
    }
    await db.delete(schema.mediations).where(eq(schema.mediations.postId, postId));
    await db.delete(schema.foundPosts).where(eq(schema.foundPosts.id, postId));
    await db.delete(schema.notifications).where(inArray(schema.notifications.userId, createdUserIds));
    await db.delete(schema.userSafetyReports).where(inArray(schema.userSafetyReports.reporterId, createdUserIds));
    await db.delete(schema.users).where(inArray(schema.users.id, createdUserIds));
  });

  it("starts a direct thread from a post and exchanges messages", async () => {
    const applicant = caller(applicantId);
    const started = await applicant.chat.startWithPost({ postId });
    expect(started.created).toBe(true);
    const threadId = started.threadId;

    await applicant.chat.send({ threadId, body: "拾得物について質問してもいいですか？" });
    const owner = caller(ownerId);
    const ownerList = await owner.chat.list();
    const thread = ownerList.find(row => row.id === threadId);
    expect(thread?.unreadCount).toBe(1);
    expect(thread?.title).toBe("E2E applicant");

    const unread = await owner.chat.unreadCount();
    expect(unread.count).toBe(1);

    const detail = await owner.chat.messages({ threadId, limit: 50 });
    expect(detail.messages.some(message => message.body.includes("質問"))).toBe(true);
    expect(detail.canPost).toBe(true);

    await owner.chat.markRead({ threadId });
    const afterRead = await owner.chat.unreadCount();
    expect(afterRead.count).toBe(0);

    await owner.chat.send({ threadId, body: "はい、どうぞ。" });
    const applicantDetail = await applicant.chat.messages({ threadId, limit: 50 });
    expect(applicantDetail.messages.at(-1)?.body).toBe("はい、どうぞ。");
  });

  it("rejects personal information in messages", async () => {
    const applicant = caller(applicantId);
    const threads = await applicant.chat.list();
    const threadId = threads[0].id;
    await expect(applicant.chat.send({ threadId, body: "電話は090-1234-5678です" })).rejects.toThrow(/個人情報|安全/);
  });

  it("keeps threads private to members", async () => {
    const applicant = caller(applicantId);
    const threads = await applicant.chat.list();
    const outsider = caller(thirdId);
    await expect(outsider.chat.messages({ threadId: threads[0].id, limit: 20 })).rejects.toThrow(/見つからない/);
  });

  it("supports group threads, adding members and leaving", async () => {
    const owner = caller(ownerId);
    const contacts = await owner.chat.contacts();
    expect(contacts.map(person => person.id)).toEqual(expect.arrayContaining([applicantId, thirdId]));
    const group = await owner.chat.createGroup({ title: "E2E受け渡し相談", memberIds: [applicantId, thirdId] });
    const detail = await owner.chat.messages({ threadId: group.threadId, limit: 20 });
    expect(detail.thread.kind).toBe("group");
    expect(detail.thread.memberCount).toBe(3);
    expect(detail.messages[0].kind).toBe("system");

    await owner.chat.send({ threadId: group.threadId, body: "明日の受け渡しについて相談です。" });
    const third = await caller(thirdId).chat.list();
    expect(third.some(row => row.id === group.threadId && row.unreadCount === 1)).toBe(true);

    await caller(thirdId).chat.leave({ threadId: group.threadId });
    const afterLeave = await caller(thirdId).chat.list();
    expect(afterLeave.some(row => row.id === group.threadId)).toBe(false);
  });

  it("stops a direct conversation after a block", async () => {
    const applicant = caller(applicantId);
    const threads = await applicant.chat.list();
    const dm = threads.find(row => row.kind === "dm");
    expect(dm).toBeTruthy();
    await caller(ownerId).chat.blockCounterpart({ threadId: dm!.id });
    await expect(applicant.chat.send({ threadId: dm!.id, body: "ブロック後の送信テスト" })).rejects.toThrow(/停止/);
    const list = await applicant.chat.list();
    expect(list.find(row => row.id === dm!.id)?.communicationBlocked).toBe(true);
  });

  it("refuses direct messages to strangers", async () => {
    const founder = await import("../drizzle/schema");
    expect(founder.users).toBeTruthy();
    const applicant = caller(applicantId);
    await expect(applicant.chat.startDm({ userId: 999_999 })).rejects.toThrow();
  });
});
