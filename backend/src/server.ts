import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env, corsOrigins } from "./env.js";
import { registerErrorHandler, HttpError } from "./lib/http.js";
import { verifyAccessToken } from "./auth/tokens.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerClientRoutes } from "./routes/clients.js";
import { registerSowRoutes } from "./routes/sows.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerLogRoutes } from "./routes/logs.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";

const app = Fastify({
  logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
  bodyLimit: 1_000_000, // 1 MB
  trustProxy: true, // behind nginx — use X-Forwarded-For for req.ip / rate limiting
});

await app.register(helmet);
await app.register(cors, { origin: corsOrigins, credentials: true });
await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

// Verify the Bearer access token and attach the tenant context.
app.decorate("authenticate", async (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "unauthorized");
  req.auth = verifyAccessToken(header.slice("Bearer ".length));
});

registerErrorHandler(app);

app.get("/health", async () => ({ ok: true }));

registerAuthRoutes(app);
registerClientRoutes(app);
registerSowRoutes(app);
registerProjectRoutes(app);
registerLogRoutes(app);
registerDashboardRoutes(app);

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((addr) => app.log.info(`Helm API listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
