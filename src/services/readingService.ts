import type { Pool, PoolClient } from "pg";
import { parseReadingTime } from "../lib/time.js";

export type ReadingPoint = {
  time: string;
  p?: number | null;
  q?: number | null;
  h?: number | null;
  AdditionalDetails?: Record<string, unknown> | null;
};

export type ReadingRowOut = {
  time: string;
  p: number | null;
  q: number | null;
  h: number | null;
  AdditionalDetails: Record<string, unknown> | null;
};

export async function listReadingsByDataloggerCode(
  pool: Pool,
  dataloggerCode: string,
  opts: {
    from?: Date;
    to?: Date;
    limit: number;
    order: "asc" | "desc";
  }
): Promise<ReadingRowOut[] | null> {
  const orderSql = opts.order === "asc" ? "ASC" : "DESC";
  const res = await pool.query<{
    time: Date;
    p: string | null;
    q: string | null;
    h: string | null;
    additional_details: Record<string, unknown> | null;
  }>(
    `SELECT r."time", r.p, r.q, r.h, r.additional_details
     FROM datalogger_readings r
     INNER JOIN devices d ON d.id = r.device_id
     WHERE d.datalogger_code = $1
       AND d.deleted_at IS NULL
       AND ($2::timestamptz IS NULL OR r."time" >= $2)
       AND ($3::timestamptz IS NULL OR r."time" <= $3)
     ORDER BY r."time" ${orderSql}
     LIMIT $4`,
    [dataloggerCode, opts.from ?? null, opts.to ?? null, opts.limit]
  );
  if (res.rows.length === 0) {
    const dev = await pool.query(`SELECT 1 FROM devices WHERE datalogger_code = $1 AND deleted_at IS NULL`, [
      dataloggerCode,
    ]);
    if (dev.rowCount === 0) return null;
  }
  return res.rows.map((row) => ({
    time: row.time.toISOString(),
    p: row.p == null ? null : Number(row.p),
    q: row.q == null ? null : Number(row.q),
    h: row.h == null ? null : Number(row.h),
    AdditionalDetails: row.additional_details,
  }));
}

export async function insertReadingsBatch(
  client: PoolClient,
  deviceId: string,
  points: ReadingPoint[]
): Promise<number> {
  if (points.length === 0) return 0;
  const times: Date[] = [];
  const ps: Array<number | null> = [];
  const qs: Array<number | null> = [];
  const hs: Array<number | null> = [];
  const additionalDetails: Array<string | null> = [];
  for (const pt of points) {
    times.push(parseReadingTime(pt.time));
    ps.push(pt.p ?? null);
    qs.push(pt.q ?? null);
    hs.push(pt.h ?? null);
    additionalDetails.push(pt.AdditionalDetails == null ? null : JSON.stringify(pt.AdditionalDetails));
  }
  const res = await client.query(
    `INSERT INTO datalogger_readings (device_id, "time", p, q, h, additional_details)
     SELECT $1::uuid, x.t, x.p, x.q, x.h,
            CASE WHEN x.additional_details IS NULL THEN NULL ELSE x.additional_details::jsonb END
     FROM unnest($2::timestamptz[], $3::numeric[], $4::numeric[], $5::numeric[], $6::text[]) AS x(t, p, q, h, additional_details)
     ON CONFLICT (device_id, "time") DO NOTHING`,
    [deviceId, times, ps, qs, hs, additionalDetails]
  );
  return res.rowCount ?? 0;
}
