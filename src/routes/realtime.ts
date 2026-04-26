import type { FastifyPluginAsync } from "fastify";
import type pg from "pg";
import type { Env } from "../config.js";
import { getRealtimeReadingsStreamSchema, getRealtimeSummaryStreamSchema } from "../openapi/schemas.js";
import { buildRealtimeStreamQuerySchema } from "../schemas/readings.js";
import { listReadingsByDataloggerCode } from "../services/readingService.js";
import { type ReadingCreatedEvent, type ReadingSummaryEvent, RealtimeService } from "../services/realtimeService.js";

export type RealtimeOpts = { pool: pg.Pool; env: Env; realtimeService: RealtimeService };

function toSseFrame(opts: { event: string; id?: string; data: unknown }): string {
  const idPart = opts.id ? `id: ${opts.id}\n` : "";
  return `${idPart}event: ${opts.event}\ndata: ${JSON.stringify(opts.data)}\n\n`;
}

const realtimeRoutes: FastifyPluginAsync<RealtimeOpts> = async (fastify, opts) => {
  const { pool, env, realtimeService } = opts;
  const querySchema = buildRealtimeStreamQuerySchema(env.REALTIME_BACKFILL_LIMIT);

  fastify.get("/summary/stream", { schema: getRealtimeSummaryStreamSchema }, async (request, reply) => {
    if (!realtimeService.isEnabled()) {
      return reply.code(503).send({ error: "Realtime is disabled on this server" });
    }
    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.hijack();

    const safeWrite = (chunk: string): void => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(chunk);
      }
    };
    const sendSummaryEvent = (event: ReadingSummaryEvent): void => {
      safeWrite(toSseFrame({ event: "reading.summary", id: event.eventId, data: event }));
    };
    safeWrite(
      toSseFrame({
        event: "realtime.connected",
        data: {
          scope: "summary",
          connectedAt: new Date().toISOString(),
          heartbeatMs: env.REALTIME_HEARTBEAT_MS,
        },
      })
    );
    const unsubscribe = realtimeService.subscribeSummary(sendSummaryEvent);
    const heartbeatTimer = setInterval(() => {
      safeWrite(
        toSseFrame({
          event: "realtime.heartbeat",
          data: { at: new Date().toISOString() },
        })
      );
    }, env.REALTIME_HEARTBEAT_MS);
    const cleanup = () => {
      clearInterval(heartbeatTimer);
      unsubscribe();
    };
    request.raw.on("close", cleanup);
    request.raw.on("error", cleanup);
  });

  fastify.get("/readings/stream", { schema: getRealtimeReadingsStreamSchema(env.REALTIME_BACKFILL_LIMIT) }, async (request, reply) => {
    if (!realtimeService.isEnabled()) {
      return reply.code(503).send({ error: "Realtime is disabled on this server" });
    }

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { dataloggerCode, lastEventTime, backfillLimit } = parsed.data;

    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.hijack();

    const safeWrite = (chunk: string): void => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(chunk);
      }
    };

    const sendCreatedEvent = (event: ReadingCreatedEvent): void => {
      safeWrite(toSseFrame({ event: "reading.created", id: event.eventId, data: event }));
    };

    safeWrite(
      toSseFrame({
        event: "realtime.connected",
        data: {
          dataloggerCode,
          connectedAt: new Date().toISOString(),
          heartbeatMs: env.REALTIME_HEARTBEAT_MS,
        },
      })
    );

    if (lastEventTime) {
      const from = new Date(lastEventTime);
      const readings = await listReadingsByDataloggerCode(pool, dataloggerCode, {
        from,
        to: undefined,
        limit: backfillLimit,
        order: "asc",
      });
      if (readings === null) {
        safeWrite(toSseFrame({ event: "error", data: { error: "Device not found" } }));
        reply.raw.end();
        return;
      }
      safeWrite(
        toSseFrame({
          event: "reading.backfill",
          data: {
            dataloggerCode,
            from: lastEventTime,
            count: readings.length,
            readings,
          },
        })
      );
    }

    const unsubscribe = realtimeService.subscribe(dataloggerCode, sendCreatedEvent);
    const heartbeatTimer = setInterval(() => {
      safeWrite(
        toSseFrame({
          event: "realtime.heartbeat",
          data: { at: new Date().toISOString() },
        })
      );
    }, env.REALTIME_HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeatTimer);
      unsubscribe();
    };
    request.raw.on("close", cleanup);
    request.raw.on("error", cleanup);
  });
};

export default realtimeRoutes;
