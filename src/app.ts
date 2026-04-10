import Fastify from "fastify";
import type { Env } from "./config.js";
import { parseApiKeys } from "./config.js";
import { createPool } from "./db/pool.js";
import { createAuthPreHandler } from "./auth.js";
import devicesRoutes from "./routes/devices.js";
import readingsRoutes from "./routes/readings.js";
import { registerOpenApiSpec, registerOpenApiUi } from "./openapi/register.js";
import { healthSchema } from "./openapi/schemas.js";

export async function buildApp(env: Env) {
  const pool = createPool(env);
  const keys = parseApiKeys(env.QUAWACO_API_KEYS);
  const app = Fastify({ logger: true });

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
          await r.register(readingsRoutes, { pool, env });
        },
        { prefix: "/datalogger" }
      );
    },
    { prefix: "/api/v1" }
  );

  await registerOpenApiUi(app);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return app;
}
