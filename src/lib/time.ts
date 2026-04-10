import { DateTime } from "luxon";

const VN_FORMAT = "dd/MM/yyyy HH:mm:ss";

/** ISO-8601 or `dd/MM/yyyy HH:mm:ss` interpreted as Asia/Ho_Chi_Minh. */
export function parseReadingTime(input: string): Date {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Empty time string");
  }
  const iso = DateTime.fromISO(trimmed, { setZone: true });
  if (iso.isValid) {
    return iso.toJSDate();
  }
  const vn = DateTime.fromFormat(trimmed, VN_FORMAT, {
    zone: "Asia/Ho_Chi_Minh",
  });
  if (vn.isValid) {
    return vn.toJSDate();
  }
  throw new Error(
    `Invalid time: ${input}. Use ISO-8601 or ${VN_FORMAT} (Asia/Ho_Chi_Minh).`
  );
}
