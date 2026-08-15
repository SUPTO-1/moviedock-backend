import { Router, type Request, type Response, type NextFunction } from "express";
import type { MediaType } from "./allowed-types";
import { createUploadController } from "./upload.controller";

/**
 * Per-media-type upload endpoints. The frontend dispatches a batch to one
 * of these based on which library the user picked from:
 *
 *   POST /api/photos/upload
 *   POST /api/movies/upload
 *   POST /api/series/upload
 *   POST /api/anime/upload
 *
 * The MediaType is singular (the model that drives the controller); the URL
 * slug is plural (matches the existing API convention under `/api/...`).
 */
export const mediaUploadRouter = Router();

const KIND_ROUTES: Array<{ mediaType: MediaType; slug: string }> = [
  { mediaType: "photo", slug: "photos" },
  { mediaType: "movie", slug: "movies" },
  { mediaType: "series", slug: "series" },
  { mediaType: "anime", slug: "anime" },
];

const forward = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

for (const { mediaType, slug } of KIND_ROUTES) {
  const handler = createUploadController(mediaType);
  mediaUploadRouter.post(`/${slug}/upload`, forward(handler));
}
