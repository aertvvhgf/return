/**
 * Local preview seed. Not used by the app at runtime and not part of the build.
 * Run: DATABASE_URL=... pnpm tsx scripts/seed-preview.ts
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import { getDb } from "../server/db";
import {
  chatMembers,
  chatMessages,
  chatThreads,
  foundPosts,
  mediations,
  notifications,
  users,
} from "../drizzle/schema";

const PREVIEW_OPEN_IDS = ["preview-kenta", "preview-misaki", "preview-sho"];

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000);
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required");

  const existing = await db.select({ id: users.id }).from(users).where(inArray(users.openId, PREVIEW_OPEN_IDS));
  if (existing.length) {
    const ids = existing.map(row => row.id);
    const threads = await db.select({ id: chatThreads.id }).from(chatThreads).where(inArray(chatThreads.createdBy, ids));
    if (threads.length) {
      const threadIds = threads.map(row => row.id);
      await db.delete(chatMessages).where(inArray(chatMessages.threadId, threadIds));
      await db.delete(chatMembers).where(inArray(chatMembers.threadId, threadIds));
      await db.delete(chatThreads).where(inArray(chatThreads.id, threadIds));
    }
    const posts = await db.select({ id: foundPosts.id }).from(foundPosts).where(inArray(foundPosts.ownerId, ids));
    if (posts.length) {
      await db.delete(mediations).where(inArray(mediations.postId, posts.map(row => row.id)));
      await db.delete(foundPosts).where(inArray(foundPosts.id, posts.map(row => row.id)));
    }
    await db.delete(notifications).where(inArray(notifications.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }

  const kenta = Number((await db.insert(users).values({ openId: "preview-kenta", name: "佐藤 健太", kana: "さとう けんた", loginMethod: "preview" }))[0].insertId);
  const misaki = Number((await db.insert(users).values({ openId: "preview-misaki", name: "山田 美咲", kana: "やまだ みさき", loginMethod: "preview" }))[0].insertId);
  const sho = Number((await db.insert(users).values({ openId: "preview-sho", name: "田中 翔", kana: "たなか しょう", loginMethod: "preview" }))[0].insertId);

  const walletInsert = await db.insert(foundPosts).values({
    ownerId: misaki,
    title: "黒い二つ折り財布",
    category: "wallet",
    facilityType: "rail",
    color: "黒",
    shape: "二つ折り・カード入れ付き",
    description: "新宿駅東口のベンチ付近で拾得しました。定期入れが一緒に入っています。",
    foundAt: minutesAgo(60 * 26),
    storageUntil: new Date(Date.now() + 86_400_000 * 6),
    placeLabel: "新宿駅 東口",
    deliveredTo: "新宿駅 忘れ物センター",
    privateClues: "内側に青いシール",
  });
  const airpodsInsert = await db.insert(foundPosts).values({
    ownerId: sho,
    title: "AirPods Pro（白）",
    category: "device",
    facilityType: "commercial",
    color: "白",
    shape: "ケース付き",
    description: "商業施設の休憩スペースで拾得。ケースに小さな傷があります。",
    foundAt: minutesAgo(60 * 5),
    placeLabel: "渋谷スクランブル交差点付近",
    deliveredTo: "施設総合案内",
    privateClues: "ケース裏に刻印",
  });
  const walletPost = Number(walletInsert[0].insertId);
  const airpodsPost = Number(airpodsInsert[0].insertId);

  await db.insert(mediations).values({
    id: crypto.randomUUID(),
    postId: walletPost,
    applicantId: kenta,
    ownerId: misaki,
    evidence: "内側のカード入れに息子の写真を入れています。表面右下に小さな傷があります。",
    status: "verification_in_progress",
  });

  const dmId = crypto.randomUUID();
  const dmKey = [kenta, misaki].sort((a, b) => a - b).join(":");
  await db.insert(chatThreads).values({
    id: dmId,
    kind: "dm",
    dmKey,
    createdBy: kenta,
    postId: walletPost,
    topic: "黒い二つ折り財布",
    lastMessageAt: minutesAgo(6),
    lastMessagePreview: "では明日18時に新宿駅東口の改札前でお願いします。",
    lastMessageSenderId: misaki,
  });
  await db.insert(chatMembers).values([
    { threadId: dmId, userId: kenta, role: "owner", lastReadMessageId: 0 },
    { threadId: dmId, userId: misaki, role: "member", lastReadMessageId: 0 },
  ]);
  const dmMessages = await db.insert(chatMessages).values([
    { threadId: dmId, senderId: kenta, kind: "system", body: "「黒い二つ折り財布」についてのトークを開始しました。", createdAt: minutesAgo(180) },
    { threadId: dmId, senderId: kenta, body: "はじめまして。落とした財布の件でご連絡しました。特徴をいくつかお伝えしてもいいですか？", createdAt: minutesAgo(178) },
    { threadId: dmId, senderId: misaki, body: "こんにちは。もちろん大丈夫です。内側のカード入れに何が入っていたか教えていただけますか？", createdAt: minutesAgo(174) },
    { threadId: dmId, senderId: kenta, body: "カードが3枚と、息子の小さい写真が入っていました。表面の右下に傷があります。", createdAt: minutesAgo(170) },
    { threadId: dmId, senderId: misaki, body: "確認できました。間違いなさそうです。受け渡しはどちらが良いですか？", createdAt: minutesAgo(40) },
    { threadId: dmId, senderId: kenta, body: "新宿駅の改札前か、駅の忘れ物センターなら安心だと思います。", createdAt: minutesAgo(38) },
    { threadId: dmId, senderId: misaki, body: "では明日18時に新宿駅東口の改札前でお願いします。", createdAt: minutesAgo(6) },
  ]);
  void dmMessages;
  const [lastDm] = await db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.threadId, dmId)).orderBy(chatMessages.id).limit(1);
  void lastDm;
  const dmMaxRows = await db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.threadId, dmId));
  const lastDmId = Math.max(...dmMaxRows.map(row => row.id));
  await db.update(chatMembers).set({ lastReadMessageId: lastDmId }).where(and(eq(chatMembers.threadId, dmId), eq(chatMembers.userId, misaki)));

  const groupId = crypto.randomUUID();
  await db.insert(chatThreads).values({
    id: groupId,
    kind: "group",
    title: "新宿駅での受け渡し調整",
    createdBy: kenta,
    lastMessageAt: minutesAgo(2),
    lastMessagePreview: "当日は駅係員の方にも一声かけておきます。",
    lastMessageSenderId: sho,
  });
  await db.insert(chatMembers).values([
    { threadId: groupId, userId: kenta, role: "owner", lastReadMessageId: 0 },
    { threadId: groupId, userId: misaki, role: "member", lastReadMessageId: 0 },
    { threadId: groupId, userId: sho, role: "member", lastReadMessageId: 0 },
  ]);
  const groupMessages = await db.insert(chatMessages).values([
    { threadId: groupId, senderId: kenta, kind: "system", body: "「新宿駅での受け渡し調整」のグループトークを作成しました。", createdAt: minutesAgo(90) },
    { threadId: groupId, senderId: kenta, body: "財布の受け渡しについて、駅係員の方にも立ち会ってもらえるか確認したいです。", createdAt: minutesAgo(88) },
    { threadId: groupId, senderId: misaki, body: "忘れ物センターに聞いてみます。18時なら窓口が開いているはずです。", createdAt: minutesAgo(60) },
    { threadId: groupId, senderId: sho, body: "自分も同じ駅でAirPodsを拾ったので、受け渡しの流れを共有しておきます。", createdAt: minutesAgo(20) },
    { threadId: groupId, senderId: sho, body: "当日は駅係員の方にも一声かけておきます。", createdAt: minutesAgo(2) },
  ]);
  void groupMessages;
  const groupMaxRows = await db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.threadId, groupId));
  const lastGroupId = Math.max(...groupMaxRows.map(row => row.id));
  await db.update(chatMembers).set({ lastReadMessageId: lastGroupId }).where(and(eq(chatMembers.threadId, groupId), eq(chatMembers.userId, kenta)));

  await db.insert(notifications).values([
    { userId: kenta, kind: "chat", title: "山田 美咲さんからメッセージ", summary: "では明日18時に新宿駅東口の改札前でお願いします。", threadId: dmId },
    { userId: kenta, kind: "chat", title: "新宿駅での受け渡し調整に新着メッセージ", summary: "当日は駅係員の方にも一声かけておきます。", threadId: groupId, readAt: minutesAgo(30) },
  ]);

  console.log(JSON.stringify({ kenta, misaki, sho, dmId, groupId, walletPost, airpodsPost, hash: createHash("sha256").update(String(kenta)).digest("hex").slice(0, 8) }, null, 2));
  await db.update(users).set({ lastSignedIn: new Date() }).where(like(users.openId, "preview-%"));
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
