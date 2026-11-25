import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { and, eq } from "drizzle-orm";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { foundPosts } from "../../drizzle/schema";
import { getDb } from "../db";
import { storageGetSignedUrl } from "../storage";

async function startServer() {
  const app = express();
  const server = createServer(app);
  // The largest tRPC data-URL upload is capped below 8 MB by its input schema.
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/public/found-photo/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.sendStatus(404);
    try {
      const db = await getDb();
      if (!db) return res.sendStatus(503);
      const rows = await db.select({ imageUrl: foundPosts.imageUrl }).from(foundPosts)
        .where(and(eq(foundPosts.id, id), eq(foundPosts.status, "active"))).limit(1);
      const storedPath = rows[0]?.imageUrl?.match(/^\/manus-storage\/(return\/\d+\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp))$/i)?.[1];
      if (!storedPath) return res.sendStatus(404);
      const signedUrl = await storageGetSignedUrl(storedPath);
      const image = await fetch(signedUrl, { signal: AbortSignal.timeout(15_000), redirect: "error" });
      if (!image.ok) return res.sendStatus(502);
      const contentType = image.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (!contentType || !["image/jpeg", "image/png", "image/webp"].includes(contentType)) return res.sendStatus(415);
      const declaredLength = Number(image.headers.get("content-length") ?? "0");
      if (declaredLength > 5 * 1024 * 1024) return res.sendStatus(413);
      const bytes = Buffer.from(await image.arrayBuffer());
      if (bytes.byteLength > 5 * 1024 * 1024) return res.sendStatus(413);
      return res.status(200).set({
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=60",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      }).send(bytes);
    } catch {
      return res.sendStatus(502);
    }
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
