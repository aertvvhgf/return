import {
  boolean,
  double,
  index,
  int,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Manus OAuth identities. Application data always references this table's id. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  profileCode: varchar("profileCode", { length: 20 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  phone: varchar("phone", { length: 40 }),
  kana: varchar("kana", { length: 120 }),
  settings: text("settings"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const userFollows = mysqlTable("user_follows", {
  id: int("id").autoincrement().primaryKey(),
  followerId: int("followerId").notNull(),
  followingId: int("followingId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ uniqueFollow: uniqueIndex("user_follows_unique").on(table.followerId, table.followingId), followerIdx: index("user_follows_follower_idx").on(table.followerId), followingIdx: index("user_follows_following_idx").on(table.followingId) }));

export const userReviews = mysqlTable("user_reviews", {
  id: int("id").autoincrement().primaryKey(),
  mediationId: varchar("mediationId", { length: 36 }).notNull(),
  reviewerId: int("reviewerId").notNull(),
  revieweeId: int("revieweeId").notNull(),
  rating: int("rating").notNull(),
  comment: varchar("comment", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ uniqueReview: uniqueIndex("user_reviews_unique").on(table.mediationId, table.reviewerId), revieweeIdx: index("user_reviews_reviewee_idx").on(table.revieweeId, table.createdAt), reviewerIdx: index("user_reviews_reviewer_idx").on(table.reviewerId, table.createdAt) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const foundPosts = mysqlTable(
  "found_posts",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    category: mysqlEnum("category", ["wallet", "device", "keys", "daily", "bag", "clothing", "documents", "other"]).notNull(),
    facilityType: mysqlEnum("facilityType", ["rail", "police", "bus", "commercial", "community", "other"]).default("other").notNull(),
    color: varchar("color", { length: 80 }).notNull(),
    shape: varchar("shape", { length: 160 }).notNull(),
    description: text("description").notNull(),
    foundAt: timestamp("foundAt").notNull(),
    storageUntil: timestamp("storageUntil"),
    placeLabel: varchar("placeLabel", { length: 200 }).notNull(),
    deliveredTo: varchar("deliveredTo", { length: 200 }).notNull(),
    latitude: double("latitude"),
    longitude: double("longitude"),
    imageUrl: varchar("imageUrl", { length: 500 }),
    photoConsentAt: timestamp("photoConsentAt"),
    privateClues: text("privateClues").notNull(),
    status: mysqlEnum("status", ["active", "resolved", "deleted"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    ownerIdx: index("found_posts_owner_idx").on(table.ownerId, table.status),
    publicIdx: index("found_posts_public_idx").on(table.status, table.createdAt),
  }),
);

export const lostItems = mysqlTable(
  "lost_items",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    category: mysqlEnum("category", ["wallet", "device", "keys", "daily", "bag", "clothing", "documents", "other"]).notNull(),
    details: text("details").notNull(),
    lostAt: timestamp("lostAt"),
    location: varchar("location", { length: 200 }).notNull(),
    route: varchar("route", { length: 200 }),
    imageUrl: varchar("imageUrl", { length: 500 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userIdx: index("lost_items_user_idx").on(table.userId, table.isActive),
    activeIdx: index("lost_items_active_idx").on(table.isActive, table.createdAt),
  }),
);

export const savedSearches = mysqlTable(
  "saved_searches",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    query: varchar("query", { length: 200 }).notNull(),
    category: varchar("category", { length: 40 }),
    facilityType: varchar("facilityType", { length: 40 }),
    route: varchar("route", { length: 200 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ userIdx: index("saved_searches_user_idx").on(table.userId, table.createdAt) }),
);

export const lossReports = mysqlTable(
  "loss_reports",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    fullName: varchar("fullName", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 40 }).notNull(),
    itemName: varchar("itemName", { length: 160 }).notNull(),
    category: varchar("category", { length: 60 }).notNull(),
    details: text("details").notNull(),
    lostAt: timestamp("lostAt"),
    location: varchar("location", { length: 200 }).notNull(),
    route: varchar("route", { length: 200 }),
    destinations: text("destinations").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ userIdx: index("loss_reports_user_idx").on(table.userId, table.updatedAt) }),
);

export const mediations = mysqlTable(
  "mediations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    postId: int("postId").notNull(),
    applicantId: int("applicantId").notNull(),
    ownerId: int("ownerId").notNull(),
    evidence: text("evidence").notNull(),
    status: mysqlEnum("status", ["application_pending", "verification_in_progress", "handover_discussion", "handover_scheduled", "handover_completed", "cancelled", "operator_consultation"]).default("application_pending").notNull(),
    decisionNote: varchar("decisionNote", { length: 1500 }),
    handoverMethod: mysqlEnum("handoverMethod", ["public_facility", "police_station", "facility_reception"]),
    handoverPlace: varchar("handoverPlace", { length: 160 }),
    handoverAt: timestamp("handoverAt"),
    handoverLatitude: double("handoverLatitude"),
    handoverLongitude: double("handoverLongitude"),
    ownerAccepted: boolean("ownerAccepted").default(false).notNull(),
    applicantAccepted: boolean("applicantAccepted").default(false).notNull(),
    ownerCompleted: boolean("ownerCompleted").default(false).notNull(),
    applicantCompleted: boolean("applicantCompleted").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    applicantIdx: index("mediations_applicant_idx").on(table.applicantId, table.updatedAt),
    ownerIdx: index("mediations_owner_idx").on(table.ownerId, table.updatedAt),
    postIdx: index("mediations_post_idx").on(table.postId, table.createdAt),
  }),
);

export const mediationMessages = mysqlTable(
  "mediation_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    mediationId: varchar("mediationId", { length: 36 }).notNull(),
    senderId: int("senderId").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ threadIdx: index("mediation_messages_thread_idx").on(table.mediationId, table.createdAt) }),
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    mediationId: varchar("mediationId", { length: 36 }),
    threadId: varchar("threadId", { length: 36 }),
    kind: mysqlEnum("kind", ["application", "decision", "status", "message", "handover", "completion", "cancelled", "match", "chat"]).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    summary: varchar("summary", { length: 300 }).notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ userIdx: index("notifications_user_idx").on(table.userId, table.createdAt), unreadIdx: index("notifications_unread_idx").on(table.userId, table.readAt) }),
);

export const notificationPreferences = mysqlTable(
  "notification_preferences",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    kind: mysqlEnum("kind", ["application", "decision", "status", "message", "handover", "completion", "cancelled", "match", "chat"]).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ userKindUnique: uniqueIndex("notification_preferences_user_kind_idx").on(table.userId, table.kind) }),
);

export const guestSyncVaults = mysqlTable(
  "guest_sync_vaults",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    accessKeyHash: varchar("accessKeyHash", { length: 64 }).notNull(),
    encryptedPayload: mediumtext("encryptedPayload").notNull(),
    revision: int("revision").default(1).notNull(),
    status: mysqlEnum("status", ["active", "revoked", "expired"]).default("active").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ keyUnique: uniqueIndex("guest_sync_vaults_key_unique").on(table.accessKeyHash), expiryIdx: index("guest_sync_vaults_expiry_idx").on(table.status, table.expiresAt) }),
);

export const mediationReports = mysqlTable(
  "mediation_reports",
  {
    id: int("id").autoincrement().primaryKey(),
    mediationId: varchar("mediationId", { length: 36 }).notNull(),
    reporterId: int("reporterId").notNull(),
    category: mysqlEnum("category", ["personal_information", "harassment", "fraud", "unsafe_handover", "other"]).notNull(),
    details: text("details").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ mediationIdx: index("mediation_reports_case_idx").on(table.mediationId, table.createdAt) }),
);


export const userBlocks = mysqlTable(
  "user_blocks",
  {
    id: int("id").autoincrement().primaryKey(),
    blockerId: int("blockerId").notNull(),
    blockedId: int("blockedId").notNull(),
    sourcePostId: int("sourcePostId"),
    sourceMediationId: varchar("sourceMediationId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    pairUnique: uniqueIndex("user_blocks_pair_unique").on(table.blockerId, table.blockedId),
    blockedIdx: index("user_blocks_blocked_idx").on(table.blockedId, table.createdAt),
  }),
);

export const userSafetyReports = mysqlTable(
  "user_safety_reports",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    reporterId: int("reporterId").notNull(),
    reportedUserId: int("reportedUserId").notNull(),
    mediationId: varchar("mediationId", { length: 36 }),
    postId: int("postId"),
    category: mysqlEnum("category", ["personal_information", "harassment", "fraud", "unsafe_handover", "spam", "other"]).notNull(),
    details: text("details").notNull(),
    ownerNotificationAccepted: boolean("ownerNotificationAccepted").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    reporterIdx: index("user_safety_reports_reporter_idx").on(table.reporterId, table.createdAt),
    targetIdx: index("user_safety_reports_target_idx").on(table.reportedUserId, table.createdAt),
    mediationIdx: index("user_safety_reports_mediation_idx").on(table.mediationId, table.createdAt),
  }),
);

/**
 * Chat threads: 1:1 direct messages and multi-member group conversations.
 * `dmKey` is the sorted user-id pair, so a pair can only ever own one direct thread.
 */
export const chatThreads = mysqlTable(
  "chat_threads",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    kind: mysqlEnum("kind", ["dm", "group"]).notNull(),
    dmKey: varchar("dmKey", { length: 64 }),
    title: varchar("title", { length: 120 }),
    topic: varchar("topic", { length: 200 }),
    postId: int("postId"),
    mediationId: varchar("mediationId", { length: 36 }),
    createdBy: int("createdBy").notNull(),
    lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
    lastMessagePreview: varchar("lastMessagePreview", { length: 160 }),
    lastMessageSenderId: int("lastMessageSenderId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    dmKeyUnique: uniqueIndex("chat_threads_dm_key_unique").on(table.dmKey),
    recentIdx: index("chat_threads_recent_idx").on(table.lastMessageAt),
  }),
);

export const chatMembers = mysqlTable(
  "chat_members",
  {
    id: int("id").autoincrement().primaryKey(),
    threadId: varchar("threadId", { length: 36 }).notNull(),
    userId: int("userId").notNull(),
    role: mysqlEnum("role", ["owner", "member"]).default("member").notNull(),
    lastReadMessageId: int("lastReadMessageId"),
    muted: boolean("muted").default(false).notNull(),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    leftAt: timestamp("leftAt"),
  },
  table => ({
    memberUnique: uniqueIndex("chat_members_thread_user_unique").on(table.threadId, table.userId),
    userIdx: index("chat_members_user_idx").on(table.userId, table.leftAt),
  }),
);

export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    threadId: varchar("threadId", { length: 36 }).notNull(),
    senderId: int("senderId").notNull(),
    kind: mysqlEnum("kind", ["text", "image", "system"]).default("text").notNull(),
    body: text("body").notNull(),
    attachmentUrl: text("attachmentUrl"),
    attachmentName: varchar("attachmentName", { length: 160 }),
    editedAt: timestamp("editedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ threadIdx: index("chat_messages_thread_idx").on(table.threadId, table.id) }),
);


export const chatReactions = mysqlTable("chat_reactions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  userId: int("userId").notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ uniqueReaction: uniqueIndex("chat_reactions_unique").on(table.messageId, table.userId, table.emoji), messageIdx: index("chat_reactions_message_idx").on(table.messageId) }));

export const chatPins = mysqlTable("chat_pins", {
  id: int("id").autoincrement().primaryKey(),
  threadId: varchar("threadId", { length: 36 }).notNull(),
  messageId: int("messageId").notNull(),
  pinnedBy: int("pinnedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ uniquePin: uniqueIndex("chat_pins_unique").on(table.threadId, table.messageId), threadIdx: index("chat_pins_thread_idx").on(table.threadId, table.createdAt) }));

export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  endpoint: varchar("endpoint", { length: 1000 }).notNull(),
  subscriptionJson: text("subscriptionJson").notNull(),
  userAgent: varchar("userAgent", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ endpointUnique: uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint), userIdx: index("push_subscriptions_user_idx").on(table.userId) }));

export const rewardRequests = mysqlTable("reward_requests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  mediationId: varchar("mediationId", { length: 36 }).notNull(),
  payerId: int("payerId").notNull(),
  recipientId: int("recipientId").notNull(),
  amountJpy: int("amountJpy").notNull(),
  status: mysqlEnum("status", ["draft", "agreed", "payment_pending", "paid", "topup_pending", "completed", "cancelled", "unavailable"]).default("draft").notNull(),
  provider: varchar("provider", { length: 40 }).default("paypay").notNull(),
  providerPaymentId: varchar("providerPaymentId", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ mediationIdx: index("reward_requests_mediation_idx").on(table.mediationId, table.createdAt), payerIdx: index("reward_requests_payer_idx").on(table.payerId, table.createdAt) }));
