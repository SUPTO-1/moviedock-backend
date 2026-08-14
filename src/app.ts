import express from "express";
import cors from "cors";
import { jellyfinRouter } from "./modules/jellyfin/jellyfin.routes";
import { errorHandler } from "./app/middlewares/error-handler";

export const createApp = () => {
  const app = express();
  // Permissive CORS — the frontend should proxy through Next.js rewrites,
  // but this lets devtools, mobile clients, or alternate frontends hit the
  // API directly during development and from the LAN in production.
  app.use(cors({ origin: true, credentials: true }));
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