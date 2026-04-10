import { z } from "zod";

const optionalText = z.union([z.string(), z.null()]).optional();

export const devicePayloadSchema = z.object({
  dataloggerCode: z.string().min(1),
  name: optionalText,
  areaCode: optionalText,
  pressureMax: z.coerce.number().nullable().optional(),
  pressureMin: z.coerce.number().nullable().optional(),
  lat: z.coerce.number().nullable().optional(),
  lon: z.coerce.number().nullable().optional(),
  meterCode: optionalText,
  meterTypeName: optionalText,
  meterSizeCode: optionalText,
  deviceType: optionalText,
  productionYear: optionalText,
  usageYear: optionalText,
});

export const deviceCreateSchema = devicePayloadSchema;

export const deviceUpdateSchema = devicePayloadSchema.omit({ dataloggerCode: true }).partial();

export type DevicePayload = z.infer<typeof devicePayloadSchema>;
export type DeviceCreateInput = z.infer<typeof deviceCreateSchema>;
export type DeviceUpdateInput = z.infer<typeof deviceUpdateSchema>;

export const devicesListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type DevicesListQuery = z.infer<typeof devicesListQuerySchema>;
