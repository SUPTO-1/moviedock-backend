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

export const env = {
  port: Number(process.env.PORT ?? 5000),
  jellyfinUrl: jellyfinUrl.replace(/\/$/, ""),
  jellyfinApiKey: process.env.JELLYFIN_API_KEY ?? "",
  jellyfinDeviceName: process.env.JELLYFIN_DEVICE_NAME ?? "MovieDock Backend",
  jellyfinDeviceId: process.env.JELLYFIN_DEVICE_ID ?? "moviedock-backend",
};
