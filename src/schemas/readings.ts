import { z } from "zod";
import { devicePayloadSchema } from "./device.js";

/** Zod strips unknown keys; accept camelCase alias used by many JSON serializers. */
function normalizeReadingPointKeys(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const o = raw as Record<string, unknown>;
  if (o.AdditionalDetails !== undefined) {
    return raw;
  }
  if (o.additionalDetails !== undefined) {
    return { ...o, AdditionalDetails: o.additionalDetails };
  }
  return raw;
}

const readingPointSchema = z.preprocess(
  normalizeReadingPointKeys,
  z.object({
    time: z.string().min(1),
    p: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.union([z.coerce.number(), z.null()]).optional()
    ),
    q: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.union([z.coerce.number(), z.null()]).optional()
    ),
    h: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.union([z.coerce.number(), z.null()]).optional()
    ),
    AdditionalDetails: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.union([z.record(z.unknown()), z.null()]).optional()
    ),
  })
);

export const readingsIngestSchema = z.object({
  dataloggerCode: z.string().min(1),
  device: devicePayloadSchema.omit({ dataloggerCode: true }).partial().optional(),
  readings: z.array(readingPointSchema).min(1),
});

export type ReadingsIngestInput = z.infer<typeof readingsIngestSchema>;

const optionalIsoDateTime = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid ISO-8601 datetime" })
    .optional()
);

export function buildReadingsListQuerySchema(maxLimit: number) {
  return z.object({
    from: optionalIsoDateTime,
    to: optionalIsoDateTime,
    limit: z.coerce.number().int().min(1).max(maxLimit).default(100),
    order: z.enum(["asc", "desc"]).default("desc"),
  });
}

export type ReadingsListQuery = z.infer<ReturnType<typeof buildReadingsListQuerySchema>>;

export function buildRealtimeStreamQuerySchema(backfillLimit: number) {
  return z.object({
    dataloggerCode: z.string().min(1),
    lastEventTime: optionalIsoDateTime,
    backfillLimit: z.coerce.number().int().min(1).max(backfillLimit).default(backfillLimit),
  });
}
