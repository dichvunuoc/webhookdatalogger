import type { FastifyPluginAsync } from "fastify";
import {
  deviceCreateSchema,
  deviceUpdateSchema,
} from "../schemas/device.js";
import {
  insertDevice,
  listDevices,
  rowToResponse,
  softDeleteByCode,
  updateDeviceByCode,
} from "../services/deviceService.js";
import type { Env } from "../config.js";
import type pg from "pg";
import {
  deleteDeviceSchema,
  getDevicesListSchema,
  patchDeviceSchema,
  postDeviceSchema,
} from "../openapi/schemas.js";
import { devicesListQuerySchema } from "../schemas/device.js";
import { FallbackWebhookService } from "../services/fallbackWebhookService.js";

export type DevicesOpts = { pool: pg.Pool; env: Env };

const devicesRoutes: FastifyPluginAsync<DevicesOpts> = async (fastify, opts) => {
  const { pool, env } = opts;
  const fallbackService = new FallbackWebhookService(env.FALLBACK_WEBHOOK_URL, env.FALLBACK_API_KEY);

  fastify.get("/", { schema: getDevicesListSchema }, async (request, reply) => {
    const parsed = devicesListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { limit, offset } = parsed.data;
    const { items, total } = await listDevices(pool, { limit, offset });
    return { total, limit, offset, items };
  });

  fastify.post("/", { schema: postDeviceSchema }, async (request, reply) => {
    const parsed = deviceCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const row = await insertDevice(pool, parsed.data);
      return reply.code(201).send(rowToResponse(row));
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        return reply.code(409).send({
          error: "Device with this dataloggerCode already exists",
        });
      }
      throw e;
    }
  });

  fastify.patch("/:dataloggerCode", { schema: patchDeviceSchema }, async (request, reply) => {
    const code = (request.params as { dataloggerCode: string }).dataloggerCode;
    const parsed = deviceUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const row = await updateDeviceByCode(pool, decodeURIComponent(code), parsed.data);
    if (!row) {
      return reply.code(404).send({ error: "Device not found" });
    }
    return rowToResponse(row);
  });

  fastify.delete("/:dataloggerCode", { schema: deleteDeviceSchema }, async (request, reply) => {
    const code = (request.params as { dataloggerCode: string }).dataloggerCode;
    const ok = await softDeleteByCode(pool, decodeURIComponent(code));
    if (!ok) {
      return reply.code(404).send({ error: "Device not found" });
    }
    return reply.code(204).send();
  });
};

export default devicesRoutes;
