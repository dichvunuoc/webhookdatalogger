import { z } from "zod";
import { devicePayloadSchema } from "./device.js";

const readingPointSchema = z.object({
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
});

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
