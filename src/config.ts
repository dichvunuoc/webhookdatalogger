import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  QUAWACO_API_KEYS: z.string().min(1),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  MAX_READINGS_PER_REQUEST: z.coerce.number().default(5000),
  REALTIME_ENABLED: z.coerce.boolean().default(false),
  REALTIME_REDIS_URL: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().url().optional()
  ),
  REALTIME_REDIS_CHANNEL: z.string().min(1).default("datalogger:readings:realtime"),
  REALTIME_HEARTBEAT_MS: z.coerce.number().int().min(5000).max(60000).default(15000),
  REALTIME_BACKFILL_LIMIT: z.coerce.number().int().min(1).max(5000).default(500),
  FALLBACK_WEBHOOK_URL: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().url().optional()
  ),
  FALLBACK_API_KEY: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(1).optional()
  ),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function parseApiKeys(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
  );
}
