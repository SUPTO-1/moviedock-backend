import { Router } from "express";
import { getJellyfinHealth, getJellyfinImage, getJellyfinItemById, getJellyfinItems, getJellyfinSections } from "./jellyfin-client.js";

export const moviesRouter = Router();

moviesRouter.get("/health", async (_req, res, next) => {
  try {
    const health = await getJellyfinHealth();
    res.json(health);
  } catch (error) {
    next(error);
  }
});

moviesRouter.get("/sections", async (_req, res, next) => {
  try {
    const sections = await getJellyfinSections();
    res.json({ items: sections });
  } catch (error) {
    next(error);
  }
});

moviesRouter.get("/items", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const type = typeof req.query.type === "string" ? req.query.type : "all";
    const items = await getJellyfinItems(Number.isFinite(limit) ? limit : 20, type === "movie" || type === "series" || type === "anime" ? type : "all");

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

moviesRouter.get("/items/:id", async (req, res, next) => {
  try {
    const item = await getJellyfinItemById(req.params.id);
    res.json(item);
  } catch (error) {
    next(error);
  }
});

moviesRouter.get("/images/:id/:kind", async (req, res, next) => {
  try {
    const kind = req.params.kind === "backdrop" ? "backdrop" : "primary";
    const image = await getJellyfinImage(req.params.id, kind);

    if (image.contentType) {
      res.setHeader("Content-Type", image.contentType);
    }

    res.send(image.buffer);
  } catch (error) {
    next(error);
  }
});
