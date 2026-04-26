import { randomUUID } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import type { Env } from "../config.js";
import type { ReadingPoint } from "./readingService.js";

export type ReadingCreatedEvent = {
  eventId: string;
  dataloggerCode: string;
  readings: ReadingPoint[];
  inserted: number;
  received: number;
  publishedAt: string;
};

export type ReadingSummaryEvent = {
  eventId: string;
  dataloggerCode: string;
  latestTime: string | null;
  p: number | null;
  q: number | null;
  h: number | null;
  inserted: number;
  received: number;
  publishedAt: string;
};

type RealtimeEnvelope = {
  kind: "reading.created";
  sourceInstanceId: string;
  payload: ReadingCreatedEvent;
};

type RealtimeSubscriber = (event: ReadingCreatedEvent) => void;
type RealtimeSummarySubscriber = (event: ReadingSummaryEvent) => void;

export interface RealtimeTransport {
  start(onMessage: (message: string) => void): Promise<void>;
  publish(message: string): Promise<void>;
  stop(): Promise<void>;
}

class RedisRealtimeTransport implements RealtimeTransport {
  private publisher?: RedisClientType;
  private subscriber?: RedisClientType;

  constructor(
    private readonly redisUrl: string,
    private readonly redisChannel: string
  ) {}

  async start(onMessage: (message: string) => void): Promise<void> {
    this.publisher = createClient({ url: this.redisUrl });
    this.subscriber = createClient({ url: this.redisUrl });
    await this.publisher.connect();
    await this.subscriber.connect();
    await this.subscriber.subscribe(this.redisChannel, onMessage);
  }

  async publish(message: string): Promise<void> {
    if (!this.publisher) {
      return;
    }
    await this.publisher.publish(this.redisChannel, message);
  }

  async stop(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit().catch(() => undefined);
      this.subscriber = undefined;
    }
    if (this.publisher) {
      await this.publisher.quit().catch(() => undefined);
      this.publisher = undefined;
    }
  }
}

export class RealtimeService {
  private readonly enabled: boolean;
  private readonly sourceInstanceId = randomUUID();
  private readonly subscribers = new Map<string, Set<RealtimeSubscriber>>();
  private readonly summarySubscribers = new Set<RealtimeSummarySubscriber>();
  private readonly transport?: RealtimeTransport;
  private started = false;

  constructor(env: Env, transport?: RealtimeTransport) {
    this.enabled = env.REALTIME_ENABLED;
    if (transport) {
      this.transport = transport;
    } else if (env.REALTIME_REDIS_URL) {
      this.transport = new RedisRealtimeTransport(env.REALTIME_REDIS_URL, env.REALTIME_REDIS_CHANNEL);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async start(): Promise<void> {
    if (!this.enabled || this.started) {
      return;
    }
    if (!this.transport) {
      this.started = true;
      return;
    }
    await this.transport.start((message) => {
      let envelope: RealtimeEnvelope;
      try {
        envelope = JSON.parse(message) as RealtimeEnvelope;
      } catch {
        return;
      }
      if (envelope.kind !== "reading.created" || envelope.sourceInstanceId === this.sourceInstanceId) {
        return;
      }
      this.fanOut(envelope.payload);
    });
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.started = false;
    if (this.transport) {
      await this.transport.stop().catch(() => undefined);
    }
    this.subscribers.clear();
  }

  subscribe(dataloggerCode: string, onEvent: RealtimeSubscriber): () => void {
    const key = dataloggerCode.trim();
    const set = this.subscribers.get(key) ?? new Set<RealtimeSubscriber>();
    set.add(onEvent);
    this.subscribers.set(key, set);
    return () => {
      const current = this.subscribers.get(key);
      if (!current) {
        return;
      }
      current.delete(onEvent);
      if (current.size === 0) {
        this.subscribers.delete(key);
      }
    };
  }

  subscribeSummary(onEvent: RealtimeSummarySubscriber): () => void {
    this.summarySubscribers.add(onEvent);
    return () => {
      this.summarySubscribers.delete(onEvent);
    };
  }

  async publishReadingCreated(input: {
    dataloggerCode: string;
    readings: ReadingPoint[];
    inserted: number;
    received: number;
  }): Promise<ReadingCreatedEvent | null> {
    if (!this.enabled) {
      return null;
    }
    const payload: ReadingCreatedEvent = {
      eventId: randomUUID(),
      dataloggerCode: input.dataloggerCode,
      readings: input.readings,
      inserted: input.inserted,
      received: input.received,
      publishedAt: new Date().toISOString(),
    };
    this.fanOut(payload);
    if (this.transport) {
      const envelope: RealtimeEnvelope = {
        kind: "reading.created",
        sourceInstanceId: this.sourceInstanceId,
        payload,
      };
      await this.transport.publish(JSON.stringify(envelope));
    }
    return payload;
  }

  private fanOut(payload: ReadingCreatedEvent): void {
    const listeners = this.subscribers.get(payload.dataloggerCode);
    if (listeners && listeners.size > 0) {
      for (const subscriber of listeners) {
        subscriber(payload);
      }
    }
    const latest = payload.readings.at(-1) ?? null;
    const summary: ReadingSummaryEvent = {
      eventId: payload.eventId,
      dataloggerCode: payload.dataloggerCode,
      latestTime: latest?.time ?? null,
      p: latest?.p ?? null,
      q: latest?.q ?? null,
      h: latest?.h ?? null,
      inserted: payload.inserted,
      received: payload.received,
      publishedAt: payload.publishedAt,
    };
    for (const subscriber of this.summarySubscribers) {
      subscriber(summary);
    }
  }
}
