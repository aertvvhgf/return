import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const connection = await mysql.createConnection(url);
try {
  const [profileRows] = await connection.query("SHOW COLUMNS FROM users LIKE 'profileCode'");
  if (Array.isArray(profileRows) && profileRows.length === 0) {
    await connection.query("ALTER TABLE users ADD COLUMN profileCode VARCHAR(20) NULL UNIQUE AFTER email");
    console.log("[Startup] Added users.profileCode");
  }
  const [missing] = await connection.query("SELECT id FROM users WHERE profileCode IS NULL OR profileCode = '' LIMIT 500");
  if (Array.isArray(missing)) {
    for (const row of missing) {
      const code = `R${String(row.id).padStart(7, '0')}`;
      await connection.query("UPDATE users SET profileCode = ? WHERE id = ? AND (profileCode IS NULL OR profileCode = '')", [code, row.id]);
    }
    if (missing.length) console.log(`[Startup] Backfilled ${missing.length} profile IDs`);
  }
  const [rows] = await connection.query("SHOW COLUMNS FROM users LIKE 'passwordHash'");
  if (Array.isArray(rows) && rows.length === 0) {
    await connection.query("ALTER TABLE users ADD COLUMN passwordHash VARCHAR(255) NULL AFTER email");
    console.log("[Startup] Added users.passwordHash");
  } else {
    console.log("[Startup] users.passwordHash is ready");
  }

  // Chat media support was added after the original chat table migration.
  // Keep existing Railway databases compatible without destructive migrations.
  await connection.query(`CREATE TABLE IF NOT EXISTS chat_pins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    threadId VARCHAR(36) NOT NULL,
    messageId INT NOT NULL,
    pinnedBy INT NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY chat_pins_unique (threadId, messageId)
  )`);
  await connection.query(`CREATE TABLE IF NOT EXISTS chat_reactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    messageId INT NOT NULL,
    userId INT NOT NULL,
    emoji VARCHAR(16) NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY chat_reactions_unique (messageId, userId, emoji)
  )`);
  const chatColumns = [
    ["attachmentUrl", "TEXT NULL"],
    ["attachmentName", "VARCHAR(160) NULL"],
    ["editedAt", "TIMESTAMP NULL"],
  ];
  for (const [name, definition] of chatColumns) {
    const [columns] = await connection.query("SHOW COLUMNS FROM chat_messages LIKE ?", [name]);
    if (Array.isArray(columns) && columns.length === 0) {
      await connection.query(`ALTER TABLE chat_messages ADD COLUMN \`${name}\` ${definition}`);
      console.log(`[Startup] Added chat_messages.${name}`);
    }
  }
  await connection.query(`CREATE TABLE IF NOT EXISTS user_follows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    followerId INT NOT NULL,
    followingId INT NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY user_follows_unique (followerId, followingId),
    KEY user_follows_follower_idx (followerId),
    KEY user_follows_following_idx (followingId)
  )`);
  await connection.query(`CREATE TABLE IF NOT EXISTS user_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mediationId VARCHAR(36) NOT NULL,
    reviewerId INT NOT NULL,
    revieweeId INT NOT NULL,
    rating INT NOT NULL,
    comment VARCHAR(500) NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY user_reviews_unique (mediationId, reviewerId),
    KEY user_reviews_reviewee_idx (revieweeId, createdAt),
    KEY user_reviews_reviewer_idx (reviewerId, createdAt)
  )`);
  console.log("[Startup] Follow and review tables are ready");
} finally {
  await connection.end();
}
