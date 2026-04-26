import type { FastifyPluginAsync } from "fastify";
import { buildReadingsListQuerySchema, readingsIngestSchema } from "../schemas/readings.js";
import { ensureDeviceForReadings } from "../services/deviceService.js";
import { insertReadingsBatch, listReadingsByDataloggerCode } from "../services/readingService.js";
import type { Env } from "../config.js";
import type pg from "pg";
import { getReadingsListSchema, postReadingsSchema } from "../openapi/schemas.js";
import { FallbackWebhookService } from "../services/fallbackWebhookService.js";
import { RealtimeService } from "../services/realtimeService.js";

export type ReadingsOpts = { pool: pg.Pool; env: Env; realtimeService: RealtimeService };

const readingsRoutes: FastifyPluginAsync<ReadingsOpts> = async (fastify, opts) => {
  const { pool, env, realtimeService } = opts;
  const listQuerySchema = buildReadingsListQuerySchema(env.MAX_READINGS_PER_REQUEST);
  const fallbackService = new FallbackWebhookService(env.FALLBACK_WEBHOOK_URL, env.FALLBACK_API_KEY);

  fastify.get(
    "/:dataloggerCode/readings",
    { schema: getReadingsListSchema(env.MAX_READINGS_PER_REQUEST) },
    async (request, reply) => {
      const code = (request.params as { dataloggerCode: string }).dataloggerCode;
      const dataloggerCode = decodeURIComponent(code);
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const { from: fromStr, to: toStr, limit, order } = parsed.data;
      const from = fromStr != null ? new Date(fromStr) : undefined;
      const to = toStr != null ? new Date(toStr) : undefined;
      if (from && to && from > to) {
        return reply.code(400).send({ error: "from must be before or equal to to" });
      }
      const readings = await listReadingsByDataloggerCode(pool, dataloggerCode, {
        from,
        to,
        limit,
        order,
      });
      if (readings === null) {
        return reply.code(404).send({ error: "Device not found" });
      }
      return {
        dataloggerCode,
        count: readings.length,
        readings,
      };
    }
  );

  fastify.post("/readings", { schema: postReadingsSchema(env.MAX_READINGS_PER_REQUEST) }, async (request, reply) => {
    const parsed = readingsIngestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { dataloggerCode, device, readings } = parsed.data;
    if (readings.length > env.MAX_READINGS_PER_REQUEST) {
      return reply.code(400).send({
        error: `Too many readings (max ${env.MAX_READINGS_PER_REQUEST})`,
      });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const deviceId = await ensureDeviceForReadings(
        client,
        dataloggerCode,
        device
      );
      const inserted = await insertReadingsBatch(client, deviceId, readings);
      await client.query("COMMIT");
      fallbackService.forwardReadingsFireAndForget(dataloggerCode, readings);
      await realtimeService.publishReadingCreated({
        dataloggerCode,
        readings,
        inserted,
        received: readings.length,
      });
      return reply.code(201).send({
        dataloggerCode,
        deviceId,
        inserted,
        received: readings.length,
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (e instanceof Error && /Invalid time|Empty time/i.test(e.message)) {
        return reply.code(400).send({ error: e.message });
      }
      throw e;
    } finally {
      client.release();
    }
  });
};

export default readingsRoutes;
