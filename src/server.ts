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

  // Bind explicitly to 0.0.0.0 so the dev server is reachable from other
  // devices on the same LAN (phone, TV) via the machine's IP address.
  // Without this, on some platforms Node defaults to ::1 only and refuses
  // connections from outside localhost.
  createApp().listen(env.port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${env.port}`);
    console.log(`LAN:    http://<your-ip>:${env.port}`);
  });
};

void startServer();