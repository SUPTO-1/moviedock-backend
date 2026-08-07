import { Router } from "express";
import {
  buildJellyfinPlaybackUrl,
  getJellyfinHealth,
  getJellyfinImage,
  getJellyfinItemById,
  getJellyfinItems,
  getJellyfinSeriesEpisodes,
  refreshJellyfinLibrary,
  reportJellyfinPlaybackProgress,
  reportJellyfinPlaybackStart,
  reportJellyfinPlaybackStopped,
  resolveJellyfinPlaybackSource,
  searchJellyfinItems,
} from "./jellyfin-client";
import { getContinueWatchingItems } from "./continue-watching";

export const jellyfinRouter = Router();

jellyfinRouter.get("/health", async (_req, res, next) => {
  try {
    const health = await getJellyfinHealth();
    res.json(health);
  } catch (error) {
    next(error);
  }
});

jellyfinRouter.get("/items", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const type = typeof req.query.type === "string" ? req.query.type : "all";
    const items = await getJellyfinItems(
      Number.isFinite(limit) ? limit : 20,
      type === "movie" || type === "series" || type === "anime" ? type : "all",
    );
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

jellyfinRouter.get("/continue-watching", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const items = await getContinueWatchingItems(
      Number.isFinite(limit) && limit > 0 ? limit : 20,
    );
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

jellyfinRouter.get("/items/:id", async (req, res, next) => {
  try {
    const item = await getJellyfinItemById(req.params.id);
    res.json(item);
  } catch (error) {
    next(error);
  }
});

jellyfinRouter.get("/images/:id/:kind", async (req, res, next) => {
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

jellyfinRouter.get("/play/:id", async (req, res, next) => {
  try {
    const { itemId: playbackId, mediaSourceId: resolvedMediaSourceId } =
      await resolveJellyfinPlaybackSource(req.params.id);
    // Always use the direct .mp4 stream URL so the player can seek freely
    // instead of being limited to chunked HLS segments.
    const audio = Number(req.query.audio);
    const subtitle = Number(req.query.subtitle);
    // Prefer a mediaSourceId supplied by the client (the player knows the
    // exact source the track selection came from); otherwise fall back to
    // the one we resolved server-side. This avoids the silent failure mode
    // where Jellyfin ignores AudioStreamIndex when the wrong source is
    // selected.
    const mediaSourceId =
      typeof req.query.mediaSourceId === "string" && req.query.mediaSourceId
        ? req.query.mediaSourceId
        : resolvedMediaSourceId;
    const playbackUrl = buildJellyfinPlaybackUrl(playbackId, {
      audioStreamIndex: Number.isFinite(audio) ? audio : undefined,
      subtitleStreamIndex: Number.isFinite(subtitle) ? subtitle : undefined,
      mediaSourceId,
    });
    console.info(
      `[Jellyfin] Play redirect: ${req.params.id} -> ${playbackId} (audio=${Number.isFinite(audio) ? audio : "default"}, subtitle=${Number.isFinite(subtitle) ? subtitle : "off"}, mediaSource=${mediaSourceId ?? "n/a"})`,
    );
    res.redirect(playbackUrl);
  } catch (error) {
    next(error);
  }
});

jellyfinRouter.post("/playback/:id/start", async (req, res, next) => {
  try {
    await reportJellyfinPlaybackStart({ itemId: req.params.id, ...(req.body ?? {}) });
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

jellyfinRouter.post("/playback/:id/progress", async (req, res, next) => {
  try {
    await reportJellyfinPlaybackProgress({ itemId: req.params.id, ...(req.body ?? {}) });
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

jellyfinRouter.post("/playback/:id/stop", async (req, res, next) => {
  try {
    await reportJellyfinPlaybackStopped({ itemId: req.params.id, ...(req.body ?? {}) });
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

jellyfinRouter.get("/series/:id/episodes", async (req, res, next) => {
  try {
    const episodes = await getJellyfinSeriesEpisodes(req.params.id);
    res.json({ items: episodes });
  } catch (error) {
    next(error);
  }
});

jellyfinRouter.get("/search", async (req, res, next) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!query) {
      res.json({ items: [] });
      return;
    }
    const limit = Number(req.query.limit ?? 30);
    const items = await searchJellyfinItems(query, Number.isFinite(limit) ? limit : 30);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

jellyfinRouter.post("/library/refresh", async (_req, res, next) => {
  try {
    await refreshJellyfinLibrary();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});