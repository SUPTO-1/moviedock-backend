import express from "express";
import cors from "cors";
import { jellyfinRouter } from "./modules/jellyfin/jellyfin.routes";
import { mediaUploadRouter } from "./modules/media-upload/upload.routes";
import { errorHandler } from "./app/middlewares/error-handler";

export const createApp = () => {
  const app = express();
  // Permissive CORS — the frontend should proxy through Next.js rewrites,
  // but this lets devtools, mobile clients, or alternate frontends hit the
  // API directly during development and from the LAN in production.
  app.use(cors({ origin: true, credentials: true }));

  // Mount the streaming upload routes BEFORE any body parsers so the raw
  // multipart body is piped straight to busboy. express.json() will skip
  // anything that isn't application/json, but a long-lived streaming
  // connection hanging while express decides is wasted work.
  app.use("/api", mediaUploadRouter);

  app.use(express.json());

  app.get("/", (_req, res) => {
    res.send("movie dock is running");
  });
  app.get("/api/health", (_req, res) => {
    console.info("[Health] Ping received");
    res.json({ ok: true });
  });

  app.use("/api/jellyfin", jellyfinRouter);
  app.use(errorHandler);

  return app;
};