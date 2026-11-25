import mysql from "mysql2/promise";

export async function ensureLocalAuthSchema() {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const connection = await mysql.createConnection(url);
  try {
    const [rows] = await connection.query("SHOW COLUMNS FROM users LIKE 'passwordHash'");
    if (Array.isArray(rows) && rows.length === 0) {
      await connection.query("ALTER TABLE users ADD COLUMN passwordHash VARCHAR(255) NULL AFTER email");
      console.log("[Database] Added users.passwordHash for local login");
    }
  } finally {
    await connection.end();
  }
}
