import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

const envCandidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "src", ".env")];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const jellyfinUrl = process.env.JELLYFIN_URL ?? "http://192.168.1.100:8096";

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  port: Number(process.env.PORT ?? 5000),
  jellyfinUrl: jellyfinUrl.replace(/\/$/, ""),
  jellyfinApiKey: process.env.JELLYFIN_API_KEY ?? "",
  jellyfinDeviceName: process.env.JELLYFIN_DEVICE_NAME ?? "MovieDock Backend",
  jellyfinDeviceId: process.env.JELLYFIN_DEVICE_ID ?? "moviedock-backend",

  // LAN upload destinations point at the same paths Jellyfin reads from
  // (the compose file mounts them read-only). One file = one final location;
  // override via env if the user moves their library.
  uploadRoots: {
    photos: resolve(process.env.PHOTOS_UPLOAD_DIR ?? "E:\\photos"),
    movies: resolve(process.env.MOVIES_UPLOAD_DIR ?? "E:\\Movies"),
    series: resolve(process.env.SERIES_UPLOAD_DIR ?? "E:\\tv-shows"),
    anime: resolve(process.env.ANIME_UPLOAD_DIR ?? "E:\\anime"),
  },
  uploadLimits: {
    photo: readNumberEnv("PHOTOS_MAX_FILE_BYTES", 200 * 1024 * 1024),
    movie: readNumberEnv("MOVIES_MAX_FILE_BYTES", 50 * 1024 * 1024 * 1024),
    series: readNumberEnv("SERIES_MAX_FILE_BYTES", 50 * 1024 * 1024 * 1024),
    anime: readNumberEnv("ANIME_MAX_FILE_BYTES", 50 * 1024 * 1024 * 1024),
  },
};
