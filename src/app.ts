import express from "express";
import { moviesRouter } from "./modules/movies/movies.routes.js";
import { seriesRouter } from "./modules/series/series.routes.js";
import { errorHandler } from "./app/middlewares/error-handler.js";
const app = express();
app.use(express.json());
app.get("/", (req, res) => {
  res.send("movie dock is running");
});
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/jellyfin", moviesRouter);
app.use("/api/series", seriesRouter);
app.use(errorHandler);
export default app;