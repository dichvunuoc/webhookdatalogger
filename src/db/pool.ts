import pg from "pg";
import type { Env } from "../config.js";

export function createPool(env: Env): pg.Pool {
  return new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
  });
}
