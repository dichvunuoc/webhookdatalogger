import Fastify from "fastify";
import type { Env } from "./config.js";
import { parseApiKeys } from "./config.js";
import { createPool } from "./db/pool.js";
import { createAuthPreHandler } from "./auth.js";
import devicesRoutes from "./routes/devices.js";
import readingsRoutes from "./routes/readings.js";
import syncRoutes from "./routes/sync.js";
import realtimeRoutes from "./routes/realtime.js";
import { registerOpenApiSpec, registerOpenApiUi } from "./openapi/register.js";
import { healthSchema } from "./openapi/schemas.js";
import { RealtimeService } from "./services/realtimeService.js";

export async function buildApp(env: Env) {
  const pool = createPool(env);
  const keys = parseApiKeys(env.QUAWACO_API_KEYS);
  const normalizeOrigin = (origin: string): string => origin.trim().replace(/\/+$/, "");
  const allowedOrigins = new Set(
    env.CORS_ALLOWED_ORIGINS.split(",")
      .map((origin) => normalizeOrigin(origin))
      .filter(Boolean)
  );
  const allowAnyOrigin = allowedOrigins.has("*");
  const app = Fastify({ logger: true });
  const realtimeService = new RealtimeService(env);
  await realtimeService.start();

  app.addHook("onRequest", async (request, reply) => {
    const requestOrigin = request.headers.origin;
    const normalizedRequestOrigin = requestOrigin ? normalizeOrigin(requestOrigin) : undefined;
    if (allowAnyOrigin) {
      reply.header("Access-Control-Allow-Origin", "*");
    } else if (normalizedRequestOrigin && allowedOrigins.has(normalizedRequestOrigin)) {
      reply.header("Access-Control-Allow-Origin", normalizedRequestOrigin);
      reply.header("Vary", "Origin");
      reply.header("Access-Control-Allow-Credentials", "true");
    }

    if (request.method === "OPTIONS") {
      const requestedHeaders = request.headers["access-control-request-headers"];
      const allowHeaders = Array.isArray(requestedHeaders)
        ? requestedHeaders.join(",")
        : requestedHeaders;
      reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      reply.header(
        "Access-Control-Allow-Headers",
        allowHeaders && allowHeaders.length > 0
          ? allowHeaders
          : "Authorization,Content-Type,X-Requested-With"
      );
      return reply.code(204).send();
    }
  });

  await registerOpenApiSpec(app);

  app.get("/health", { schema: healthSchema }, async () => ({ status: "ok" }));

  await app.register(
    async (api) => {
      api.addHook("preHandler", createAuthPreHandler(keys));
      await api.register(
        async (r) => {
          await r.register(devicesRoutes, { pool, env });
        },
        { prefix: "/devices" }
      );
      await api.register(
        async (r) => {
          await r.register(readingsRoutes, { pool, env, realtimeService });
        },
        { prefix: "/datalogger" }
      );
      await api.register(
        async (r) => {
          await r.register(realtimeRoutes, { pool, env, realtimeService });
        },
        { prefix: "/realtime" }
      );
      await api.register(
        async (r) => {
          await r.register(syncRoutes, { pool, env });
        },
        { prefix: "/sync" }
      );
    },
    { prefix: "/api/v1" }
  );

  await registerOpenApiUi(app);

  app.addHook("onClose", async () => {
    await realtimeService.stop();
    await pool.end();
  });

  return app;
}
