import type { Pool, PoolClient } from "pg";
import type { DeviceCreateInput, DevicePayload, DeviceUpdateInput } from "../schemas/device.js";

export type DeviceRow = {
  id: string;
  datalogger_code: string;
  name: string | null;
  area_code: string | null;
  pressure_max: string | null;
  pressure_min: string | null;
  lat: string | null;
  lon: string | null;
  meter_code: string | null;
  meter_type_name: string | null;
  meter_size_code: string | null;
  device_type: string | null;
  production_year: string | null;
  usage_year: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export function rowToResponse(row: DeviceRow) {
  return {
    id: row.id,
    dataloggerCode: row.datalogger_code,
    name: row.name,
    areaCode: row.area_code,
    pressureMax: row.pressure_max != null ? Number(row.pressure_max) : null,
    pressureMin: row.pressure_min != null ? Number(row.pressure_min) : null,
    lat: row.lat != null ? Number(row.lat) : null,
    lon: row.lon != null ? Number(row.lon) : null,
    meterCode: row.meter_code,
    meterTypeName: row.meter_type_name,
    meterSizeCode: row.meter_size_code,
    deviceType: row.device_type,
    productionYear: row.production_year,
    usageYear: row.usage_year,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

function payloadToInsertValues(p: DevicePayload): unknown[] {
  return [
    p.dataloggerCode,
    p.name ?? null,
    p.areaCode ?? null,
    p.pressureMax ?? null,
    p.pressureMin ?? null,
    p.lat ?? null,
    p.lon ?? null,
    p.meterCode ?? null,
    p.meterTypeName ?? null,
    p.meterSizeCode ?? null,
    p.deviceType ?? null,
    p.productionYear ?? null,
    p.usageYear ?? null,
  ];
}

type DevicesListResult = {
  items: ReturnType<typeof rowToResponse>[];
  total: number;
};

export async function listDevices(
  pool: Pool,
  opts: { limit: number; offset: number }
): Promise<DevicesListResult> {
  const res = await pool.query<DeviceRow & { total: string }>(
    `SELECT
       (SELECT COUNT(*)::bigint FROM devices WHERE deleted_at IS NULL) AS total,
       d.*
     FROM devices d
     WHERE d.deleted_at IS NULL
     ORDER BY d.datalogger_code ASC
     LIMIT $1 OFFSET $2`,
    [opts.limit, opts.offset]
  );
  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  const items = res.rows.map((row) => {
    const { total: _t, ...rest } = row;
    return rowToResponse(rest);
  });
  return { items, total };
}

export async function insertDevice(
  pool: Pool,
  input: DeviceCreateInput
): Promise<DeviceRow> {
  const values = payloadToInsertValues(input);
  const res = await pool.query<DeviceRow>(
    `INSERT INTO devices (
      datalogger_code, name, area_code, pressure_max, pressure_min,
      lat, lon, meter_code, meter_type_name, meter_size_code, device_type,
      production_year, usage_year
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *`,
    values
  );
  return res.rows[0]!;
}

export async function updateDeviceByCode(
  pool: Pool,
  dataloggerCode: string,
  patch: DeviceUpdateInput
): Promise<DeviceRow | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, v: unknown) => {
    sets.push(`${col} = $${i++}`);
    vals.push(v);
  };
  if (patch.name !== undefined) add("name", patch.name);
  if (patch.areaCode !== undefined) add("area_code", patch.areaCode);
  if (patch.pressureMax !== undefined) add("pressure_max", patch.pressureMax);
  if (patch.pressureMin !== undefined) add("pressure_min", patch.pressureMin);
  if (patch.lat !== undefined) add("lat", patch.lat);
  if (patch.lon !== undefined) add("lon", patch.lon);
  if (patch.meterCode !== undefined) add("meter_code", patch.meterCode);
  if (patch.meterTypeName !== undefined) add("meter_type_name", patch.meterTypeName);
  if (patch.meterSizeCode !== undefined) add("meter_size_code", patch.meterSizeCode);
  if (patch.deviceType !== undefined) add("device_type", patch.deviceType);
  if (patch.productionYear !== undefined) add("production_year", patch.productionYear);
  if (patch.usageYear !== undefined) add("usage_year", patch.usageYear);
  if (sets.length === 0) {
    const cur = await pool.query<DeviceRow>(
      `SELECT * FROM devices WHERE datalogger_code = $1 AND deleted_at IS NULL`,
      [dataloggerCode]
    );
    return cur.rows[0] ?? null;
  }
  sets.push(`updated_at = now()`);
  vals.push(dataloggerCode);
  const res = await pool.query<DeviceRow>(
    `UPDATE devices SET ${sets.join(", ")}
     WHERE datalogger_code = $${i} AND deleted_at IS NULL
     RETURNING *`,
    vals
  );
  return res.rows[0] ?? null;
}

export async function softDeleteByCode(
  pool: Pool,
  dataloggerCode: string
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE devices SET deleted_at = now(), updated_at = now()
     WHERE datalogger_code = $1 AND deleted_at IS NULL`,
    [dataloggerCode]
  );
  return (res.rowCount ?? 0) > 0;
}

/** Transaction: lock or create device; optionally merge metadata from ingest. */
export async function ensureDeviceForReadings(
  client: PoolClient,
  dataloggerCode: string,
  devicePatch?: Partial<Omit<DevicePayload, "dataloggerCode">>
): Promise<string> {
  const sel = await client.query<DeviceRow>(
    `SELECT * FROM devices WHERE datalogger_code = $1 FOR UPDATE`,
    [dataloggerCode]
  );
  let row = sel.rows[0];
  if (row?.deleted_at) {
    await client.query(
      `UPDATE devices SET deleted_at = NULL, updated_at = now() WHERE id = $1`,
      [row.id]
    );
    row = { ...row, deleted_at: null };
  }
  if (row) {
    if (devicePatch && Object.keys(devicePatch).length > 0) {
      await mergeDeviceUpdate(client, row.id, devicePatch);
    }
    return row.id;
  }
  const p: DevicePayload = {
    dataloggerCode,
    name: devicePatch?.name ?? null,
    areaCode: devicePatch?.areaCode ?? null,
    pressureMax: devicePatch?.pressureMax ?? null,
    pressureMin: devicePatch?.pressureMin ?? null,
    lat: devicePatch?.lat ?? null,
    lon: devicePatch?.lon ?? null,
    meterCode: devicePatch?.meterCode ?? null,
    meterTypeName: devicePatch?.meterTypeName ?? null,
    meterSizeCode: devicePatch?.meterSizeCode ?? null,
    deviceType: devicePatch?.deviceType ?? null,
    productionYear: devicePatch?.productionYear ?? null,
    usageYear: devicePatch?.usageYear ?? null,
  };
  const ins = await client.query<DeviceRow>(
    `INSERT INTO devices (
      datalogger_code, name, area_code, pressure_max, pressure_min,
      lat, lon, meter_code, meter_type_name, meter_size_code, device_type,
      production_year, usage_year
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *`,
    payloadToInsertValues(p)
  );
  return ins.rows[0]!.id;
}

async function mergeDeviceUpdate(
  client: PoolClient,
  deviceId: string,
  patch: Partial<Omit<DevicePayload, "dataloggerCode">>
) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, v: unknown) => {
    sets.push(`${col} = $${i++}`);
    vals.push(v);
  };
  if (patch.name !== undefined) add("name", patch.name);
  if (patch.areaCode !== undefined) add("area_code", patch.areaCode);
  if (patch.pressureMax !== undefined) add("pressure_max", patch.pressureMax);
  if (patch.pressureMin !== undefined) add("pressure_min", patch.pressureMin);
  if (patch.lat !== undefined) add("lat", patch.lat);
  if (patch.lon !== undefined) add("lon", patch.lon);
  if (patch.meterCode !== undefined) add("meter_code", patch.meterCode);
  if (patch.meterTypeName !== undefined) add("meter_type_name", patch.meterTypeName);
  if (patch.meterSizeCode !== undefined) add("meter_size_code", patch.meterSizeCode);
  if (patch.deviceType !== undefined) add("device_type", patch.deviceType);
  if (patch.productionYear !== undefined) add("production_year", patch.productionYear);
  if (patch.usageYear !== undefined) add("usage_year", patch.usageYear);
  if (sets.length === 0) return;
  sets.push(`updated_at = now()`);
  vals.push(deviceId);
  await client.query(
    `UPDATE devices SET ${sets.join(", ")} WHERE id = $${i}`,
    vals
  );
}
