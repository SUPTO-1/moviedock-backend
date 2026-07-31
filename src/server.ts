import app from "./app.js";
import { env } from "./app/config/env.js";

const PORT = env.port;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});