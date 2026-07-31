import { Router } from "express";

export const seriesRouter = Router();

seriesRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});
