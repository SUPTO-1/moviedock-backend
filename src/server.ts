import { createApp } from "./app";
import { env } from "./app/config/env";
import { waitForJellyfinConnection } from "./modules/jellyfin/jellyfin-client";

const startServer = async () => {
  try {
    await waitForJellyfinConnection(5);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    console.warn(`[Jellyfin] Startup probe failed unexpectedly: ${reason}`);
  }

  createApp().listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
  });
};

void startServer();