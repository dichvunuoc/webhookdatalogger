import type { Pool } from "pg";
import { FallbackWebhookService, type ReadingPoint } from "./fallbackWebhookService.js";
import { listAllActiveDeviceRows, rowToResponse, type DeviceRow } from "./deviceService.js";
import { listReadingsPageAsc, type ReadingRowOut } from "./readingService.js";

/** Host công khai Quawaco IOC — cố định cho API đồng bộ full. */
export const ICLEVER_WEBHOOK_PUBLIC_BASE = "https://datalogger-webhook.iclever.vn";

/** Theo WEBHOOK_MANUAL: tối đa ~500 điểm/request phía IOC. */
const REMOTE_READINGS_BATCH = 500;

export type FullPushToIcleverReport = {
  targetUrl: string;
  devicesAttempted: number;
  devicesSyncedOk: number;
  devicesFailed: { dataloggerCode: string; detail: string }[];
  readingsBatches: number;
  readingsPoints: number;
  readingsFailed: { dataloggerCode: string; detail: string }[];
};

function deviceRowToCreateBody(row: DeviceRow): Record<string, unknown> {
  const r = rowToResponse(row);
  const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...body } = r;
  return body;
}

function readingRowToPoint(row: ReadingRowOut): ReadingPoint {
  return {
    time: row.time,
    p: row.p,
    q: row.q,
    h: row.h,
    AdditionalDetails: row.AdditionalDetails,
  };
}

/**
 * Đẩy toàn bộ thiết bị active + readings lên datalogger-webhook.iclever.vn.
 * `apiKey` phải là key hợp lệ trên host đích.
 */
export async function runFullPushToIclever(pool: Pool, apiKey: string): Promise<FullPushToIcleverReport> {
  const targetUrl = ICLEVER_WEBHOOK_PUBLIC_BASE;
  const fb = new FallbackWebhookService(targetUrl, apiKey);
  const devicesFailed: FullPushToIcleverReport["devicesFailed"] = [];
  const readingsFailed: FullPushToIcleverReport["readingsFailed"] = [];
  let devicesSyncedOk = 0;
  let readingsBatches = 0;
  let readingsPoints = 0;

  const rows = await listAllActiveDeviceRows(pool);

  for (const row of rows) {
    const dr = await fb.upsertDeviceRemote(deviceRowToCreateBody(row));
    if (!dr.success) {
      devicesFailed.push({
        dataloggerCode: row.datalogger_code,
        detail: dr.detail ?? String(dr.statusCode ?? ""),
      });
      continue;
    }
    devicesSyncedOk += 1;

    let afterTimeExclusive: Date | null = null;
    for (;;) {
      const page = await listReadingsPageAsc(pool, row.datalogger_code, {
        afterTimeExclusive,
        limit: REMOTE_READINGS_BATCH,
      });
      if (page === null) {
        break;
      }
      if (page.length === 0) {
        break;
      }
      const points = page.map(readingRowToPoint);
      const rr = await fb.forwardReadings(row.datalogger_code, points);
      readingsBatches += 1;
      readingsPoints += points.length;
      if (!rr.success) {
        readingsFailed.push({
          dataloggerCode: row.datalogger_code,
          detail: rr.detail ?? String(rr.statusCode ?? ""),
        });
        break;
      }
      const last = page[page.length - 1]!;
      afterTimeExclusive = new Date(last.time);
      if (page.length < REMOTE_READINGS_BATCH) {
        break;
      }
    }
  }

  return {
    targetUrl,
    devicesAttempted: rows.length,
    devicesSyncedOk,
    devicesFailed,
    readingsBatches,
    readingsPoints,
    readingsFailed,
  };
}
