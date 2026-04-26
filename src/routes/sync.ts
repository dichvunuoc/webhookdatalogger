import type { FastifyPluginAsync } from "fastify";
import type pg from "pg";
import type { Env } from "../config.js";
import { postPushAllToIcleverSchema } from "../openapi/schemas.js";
import { runFullPushToIclever } from "../services/fullPushToIcleverService.js";

export type SyncOpts = { pool: pg.Pool; env: Env };

const syncRoutes: FastifyPluginAsync<SyncOpts> = async (fastify, opts) => {
  const { pool, env } = opts;

  fastify.post("/push-all", { schema: postPushAllToIcleverSchema }, async (_request, reply) => {
    const key = env.FALLBACK_API_KEY?.trim();
    if (!key) {
      return reply.code(400).send({
        error:
          "Missing FALLBACK_API_KEY: set this env to a valid X-API-Key for https://datalogger-webhook.iclever.vn before calling full push",
      });
    }
    const report = await runFullPushToIclever(pool, key);
    return reply.code(200).send(report);
  });
};

export default syncRoutes;
