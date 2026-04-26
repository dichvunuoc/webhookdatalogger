export interface ReadingPoint {
  time: string;
  p?: number | null;
  q?: number | null;
  h?: number | null;
  AdditionalDetails?: Record<string, unknown> | null;
}

interface FallbackWebhookPayload {
  dataloggerCode: string;
  readings: ReadingPoint[];
}

export interface FallbackResult {
  success: boolean;
  statusCode?: number;
  detail?: string;
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface FallbackWebhookError {
  detail?: string;
  statusCode?: number;
}

/**
 * Mirrors writes to a secondary IOC webhook (e.g. https://datalogger-webhook.iclever.vn)
 * after the local handler succeeds. Same paths as documented in WEBHOOK_MANUAL / OpenAPI.
 */
export class FallbackWebhookService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly enabled: boolean;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(url: string | undefined, apiKey: string | undefined) {
    const trimmed = (url ?? "").trim().replace(/\/+$/, "");
    this.baseUrl = trimmed;
    this.apiKey = (apiKey ?? "").trim();
    this.enabled = Boolean(trimmed && this.apiKey);
    this.timeout = 10000;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async forwardReadings(dataloggerCode: string, readings: ReadingPoint[]): Promise<FallbackResult> {
    const payload: FallbackWebhookPayload = { dataloggerCode, readings };
    return this.forwardJsonWithRetries("POST", "/api/v1/datalogger/readings", payload);
  }

  async forwardDeviceCreate(body: unknown): Promise<FallbackResult> {
    const result = await this.forwardJsonWithRetries("POST", "/api/v1/devices", body);
    if (!result.success && result.statusCode === 409) {
      return { success: true, statusCode: 409, detail: "Already exists on fallback (ignored)" };
    }
    return result;
  }

  async forwardDevicePatch(dataloggerCode: string, body: unknown): Promise<FallbackResult> {
    const path = `/api/v1/devices/${encodeURIComponent(dataloggerCode)}`;
    return this.forwardJsonWithRetries("PATCH", path, body);
  }

  async forwardDeviceDelete(dataloggerCode: string): Promise<FallbackResult> {
    const path = `/api/v1/devices/${encodeURIComponent(dataloggerCode)}`;
    return this.forwardJsonWithRetries("DELETE", path);
  }

  /**
   * POST /devices; nếu remote trả 409 thì PATCH metadata (đồng bộ full).
   */
  async upsertDeviceRemote(deviceCreateBody: Record<string, unknown>): Promise<FallbackResult> {
    const r = await this.forwardJsonWithRetries("POST", "/api/v1/devices", deviceCreateBody);
    if (r.success) {
      return r;
    }
    if (r.statusCode === 409 && typeof deviceCreateBody.dataloggerCode === "string") {
      const code = deviceCreateBody.dataloggerCode;
      const { dataloggerCode: _omit, ...patch } = deviceCreateBody;
      return this.forwardJsonWithRetries(
        "PATCH",
        `/api/v1/devices/${encodeURIComponent(code)}`,
        patch
      );
    }
    return r;
  }

  forwardReadingsFireAndForget(dataloggerCode: string, readings: ReadingPoint[]): void {
    this.fireAndForget(() => this.forwardReadings(dataloggerCode, readings));
  }

  forwardDeviceCreateFireAndForget(body: unknown): void {
    this.fireAndForget(() => this.forwardDeviceCreate(body));
  }

  forwardDevicePatchFireAndForget(dataloggerCode: string, body: unknown): void {
    this.fireAndForget(() => this.forwardDevicePatch(dataloggerCode, body));
  }

  forwardDeviceDeleteFireAndForget(dataloggerCode: string): void {
    this.fireAndForget(() => this.forwardDeviceDelete(dataloggerCode));
  }

  private fireAndForget(run: () => Promise<FallbackResult>): void {
    if (!this.enabled) {
      return;
    }
    setImmediate(() => {
      run()
        .then((r) => {
          if (!r.success) {
            console.error("[FallbackWebhook] Forward failed:", r.statusCode ?? "", r.detail ?? "");
          }
        })
        .catch((err) => {
          console.error("[FallbackWebhook] Unhandled error:", err);
        });
    });
  }

  private async forwardJsonWithRetries(
    method: HttpMethod,
    path: string,
    body?: unknown
  ): Promise<FallbackResult> {
    if (!this.enabled) {
      return { success: false, detail: "Fallback webhook is not configured" };
    }

    let lastError: FallbackWebhookError = {};

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const headers: Record<string, string> = {
          "X-API-Key": this.apiKey,
        };
        if (body !== undefined && method !== "GET" && method !== "DELETE") {
          headers["Content-Type"] = "application/json; charset=utf-8";
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body:
            body !== undefined && method !== "GET" && method !== "DELETE"
              ? JSON.stringify(body)
              : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          if (response.status !== 204 && response.headers.get("content-type")?.includes("json")) {
            await response.json().catch(() => undefined);
          }
          return { success: true, statusCode: response.status };
        }

        lastError = {
          statusCode: response.status,
          detail: await response.text().catch(() => "Unknown error"),
        };

        if (response.status >= 400 && response.status < 500) {
          return {
            success: false,
            statusCode: response.status,
            detail: lastError.detail,
          };
        }
      } catch (e) {
        lastError = { detail: e instanceof Error ? e.message : "Unknown error" };
      }

      if (attempt < this.maxRetries) {
        await this.delay(this.retryDelay * Math.pow(2, attempt));
      }
    }

    return {
      success: false,
      statusCode: lastError.statusCode,
      detail: lastError.detail || "Max retries exceeded",
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
