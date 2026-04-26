import test from "node:test";
import assert from "node:assert/strict";
import type { Env } from "../config.js";
import { RealtimeService, type RealtimeTransport } from "./realtimeService.js";

class InMemoryPubSubHub {
  private readonly listeners = new Set<(message: string) => void>();

  subscribe(listener: (message: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publish(message: string): Promise<void> {
    for (const listener of this.listeners) {
      listener(message);
    }
  }
}

class InMemoryTransport implements RealtimeTransport {
  private unsubscribe?: () => void;

  constructor(private readonly hub: InMemoryPubSubHub) {}

  async start(onMessage: (message: string) => void): Promise<void> {
    this.unsubscribe = this.hub.subscribe(onMessage);
  }

  async publish(message: string): Promise<void> {
    await this.hub.publish(message);
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}

function buildEnv(enabled: boolean): Env {
  return {
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/datalogger",
    QUAWACO_API_KEYS: "test-key",
    CORS_ALLOWED_ORIGINS: "http://localhost:5173",
    MAX_READINGS_PER_REQUEST: 5000,
    REALTIME_ENABLED: enabled,
    REALTIME_REDIS_URL: undefined,
    REALTIME_REDIS_CHANNEL: "datalogger:readings:realtime",
    REALTIME_HEARTBEAT_MS: 15000,
    REALTIME_BACKFILL_LIMIT: 500,
    FALLBACK_WEBHOOK_URL: undefined,
    FALLBACK_API_KEY: undefined,
  };
}

test("publish only fan-outs to the same dataloggerCode", async () => {
  const service = new RealtimeService(buildEnv(true));
  await service.start();

  const receivedCodes: string[] = [];
  const unsubscribeA = service.subscribe("DL-1", (event) => receivedCodes.push(event.dataloggerCode));
  const unsubscribeB = service.subscribe("DL-2", () => receivedCodes.push("DL-2"));

  await service.publishReadingCreated({
    dataloggerCode: "DL-1",
    readings: [{ time: "2026-01-01T00:00:00Z", p: 1 }],
    inserted: 1,
    received: 1,
  });

  assert.deepEqual(receivedCodes, ["DL-1"]);

  unsubscribeA();
  unsubscribeB();
  await service.stop();
});

test("unsubscribe detaches subscriber correctly", async () => {
  const service = new RealtimeService(buildEnv(true));
  await service.start();

  let count = 0;
  const unsubscribe = service.subscribe("DL-1", () => {
    count += 1;
  });
  unsubscribe();

  await service.publishReadingCreated({
    dataloggerCode: "DL-1",
    readings: [{ time: "2026-01-01T00:00:00Z", p: 1 }],
    inserted: 1,
    received: 1,
  });

  assert.equal(count, 0);
  await service.stop();
});

test("multi-instance publish reaches subscribers across instances", async () => {
  const hub = new InMemoryPubSubHub();
  const transportA = new InMemoryTransport(hub);
  const transportB = new InMemoryTransport(hub);
  const serviceA = new RealtimeService(buildEnv(true), transportA);
  const serviceB = new RealtimeService(buildEnv(true), transportB);
  await serviceA.start();
  await serviceB.start();

  const received: string[] = [];
  const unsubscribe = serviceB.subscribe("DL-9", (event) => {
    received.push(event.dataloggerCode);
  });

  await serviceA.publishReadingCreated({
    dataloggerCode: "DL-9",
    readings: [{ time: "2026-01-01T00:00:00Z", q: 2 }],
    inserted: 1,
    received: 1,
  });

  assert.deepEqual(received, ["DL-9"]);

  unsubscribe();
  await serviceA.stop();
  await serviceB.stop();
});

test("summary subscription receives lightweight event", async () => {
  const service = new RealtimeService(buildEnv(true));
  await service.start();

  const summaries: Array<{ dataloggerCode: string; latestTime: string | null; p: number | null }> = [];
  const unsubscribe = service.subscribeSummary((event) => {
    summaries.push({
      dataloggerCode: event.dataloggerCode,
      latestTime: event.latestTime,
      p: event.p,
    });
  });

  await service.publishReadingCreated({
    dataloggerCode: "DL-SUM",
    readings: [{ time: "2026-01-01T00:00:00Z", p: 9.9 }],
    inserted: 1,
    received: 1,
  });

  assert.deepEqual(summaries, [
    {
      dataloggerCode: "DL-SUM",
      latestTime: "2026-01-01T00:00:00Z",
      p: 9.9,
    },
  ]);

  unsubscribe();
  await service.stop();
});
