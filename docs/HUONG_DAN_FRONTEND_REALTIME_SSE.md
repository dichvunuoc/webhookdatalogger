# Huong Dan Frontend Realtime (SSE)

Tai lieu nay danh cho frontend web/mobile de nhan du lieu moi theo thoi gian thuc tu API.

## 1) Tong quan

- Kenh realtime su dung: **SSE (Server-Sent Events)**.
- Kien truc khuyen nghi cho dashboard nhieu thiet bi:
  - **1 ket noi global summary**: nhan event nhe cho tat ca thiet bi.
  - **0..N ket noi detail on-demand**: chi mo khi user vao trang chi tiet tung thiet bi.
- Event chinh:
  - `realtime.connected`
  - `reading.created`
  - `reading.backfill`
  - `realtime.heartbeat`
  - `error` (truong hop dac biet)

## 2) Endpoint va Auth

- URL stream:
  - Global summary (1 ket noi): `GET /api/v1/realtime/summary/stream`
  - Device detail (on-demand): `GET /api/v1/realtime/readings/stream?dataloggerCode=<code>`
- Header bat buoc:
  - `X-API-Key: <api-key>`
- Query ho tro:
  - `dataloggerCode` (bat buoc)
  - `lastEventTime` (optional, ISO datetime) de backfill khi reconnect
  - `backfillLimit` (optional, toi da theo server config)

Vi du:

```text
/api/v1/realtime/readings/stream?dataloggerCode=140017&lastEventTime=2026-04-25T06:00:00Z&backfillLimit=500
```

## 3) Cau truc event

### 3.1 realtime.connected

```json
{
  "dataloggerCode": "140017",
  "connectedAt": "2026-04-25T07:02:28.988Z",
  "heartbeatMs": 15000
}
```

### 3.2 reading.created (event quan trong nhat)

SSE frame:

```text
id: e5877c7d-45c7-487d-9b17-f93d8105b226
event: reading.created
data: {...json...}
```

Data:

```json
{
  "eventId": "e5877c7d-45c7-487d-9b17-f93d8105b226",
  "dataloggerCode": "140017",
  "readings": [
    {
      "time": "2026-04-25T07:02:30Z",
      "p": 3.55,
      "q": 43,
      "h": 1.25
    }
  ],
  "inserted": 1,
  "received": 1,
  "publishedAt": "2026-04-25T07:02:31.034Z"
}
```

### 3.3 reading.summary (event tong quan)

Duoc gui tren endpoint `summary/stream`, dung de update list/card/map.

```json
{
  "eventId": "e5877c7d-45c7-487d-9b17-f93d8105b226",
  "dataloggerCode": "140017",
  "latestTime": "2026-04-25T07:02:30Z",
  "p": 3.55,
  "q": 43,
  "h": 1.25,
  "inserted": 1,
  "received": 1,
  "publishedAt": "2026-04-25T07:02:31.034Z"
}
```

### 3.4 reading.backfill

Duoc gui khi co `lastEventTime` hop le.

```json
{
  "dataloggerCode": "140017",
  "from": "2026-04-25T06:00:00Z",
  "count": 12,
  "readings": [
    {
      "time": "2026-04-25T06:00:01.000Z",
      "p": 3.4,
      "q": 41,
      "h": 1.1,
      "AdditionalDetails": null
    }
  ]
}
```

### 3.5 realtime.heartbeat

```json
{
  "at": "2026-04-25T07:03:00.000Z"
}
```

### 3.6 error

Vi du:

```json
{
  "error": "Device not found"
}
```

## 4) Luong xu ly khuyen nghi cho frontend

1. Mo stream global: `/api/v1/realtime/summary/stream`.
2. Khi nhan `reading.summary`: update list/card/map.
3. Khi user mo chi tiet 1 thiet bi: mo them stream detail theo `dataloggerCode`.
4. Tren stream detail, khi nhan `reading.created`: update chart/table chi tiet ngay.
5. Luu `lastProcessedTime` cho tung stream detail (khuyen nghi `publishedAt`).
6. Neu mat ket noi:
   - reconnect tu dong sau 1-3 giay (exponential backoff),
   - truyen `lastEventTime=<lastProcessedTime>` de server backfill.
7. Khi nhan `reading.backfill`: merge vao local state theo `time` (tranh duplicate).

## 5) Vi du code (Web - Browser)

Luu y: `EventSource` native khong cho set custom headers. Vi API yeu cau `X-API-Key`, can su dung polyfill/thu vien ho tro headers.

Vi du voi `@microsoft/fetch-event-source`:

```ts
import { fetchEventSource } from "@microsoft/fetch-event-source";

type ReadingCreatedEvent = {
  eventId: string;
  dataloggerCode: string;
  readings: Array<{ time: string; p?: number | null; q?: number | null; h?: number | null }>;
  inserted: number;
  received: number;
  publishedAt: string;
};

const apiBase = "https://your-domain";
const dataloggerCode = "140017";
let lastEventTime: string | undefined;

await fetchEventSource(
  `${apiBase}/api/v1/realtime/readings/stream?dataloggerCode=${encodeURIComponent(dataloggerCode)}${
    lastEventTime ? `&lastEventTime=${encodeURIComponent(lastEventTime)}` : ""
  }`,
  {
    headers: {
      "X-API-Key": "<your-api-key>",
    },
    onopen(res) {
      if (!res.ok) {
        throw new Error(`SSE open failed: ${res.status}`);
      }
    },
    onmessage(msg) {
      if (!msg.data) return;
      const data = JSON.parse(msg.data);

      if (msg.event === "reading.created") {
        const event = data as ReadingCreatedEvent;
        // TODO: merge vao state UI
        lastEventTime = event.publishedAt;
      } else if (msg.event === "reading.backfill") {
        // TODO: merge backfill vao state UI (dedupe theo reading.time)
      } else if (msg.event === "error") {
        console.error("SSE error event:", data);
      }
    },
    onerror(err) {
      // Thu vien se tu retry; co the throw de dung han
      console.error("SSE transport error:", err);
    },
  }
);
```

## 6) Vi du code (Mobile)

Tuy stack mobile:

- React Native: dung thu vien SSE/fetch-stream co ho tro custom headers.
- Flutter: dung package ho tro SSE (hoac HTTP stream) + header `X-API-Key`.

Nguyen tac xu ly giong web:

- subscribe theo `dataloggerCode`,
- reconnect khi app resume/online,
- truyen `lastEventTime` de backfill phan bi lo.

## 7) Dedupe va merge du lieu

Khuyen nghi key dedupe:

- uu tien: `(dataloggerCode, reading.time)`
- neu can theo event: `eventId` cho log/observability

Pseudo:

```ts
for (const r of incoming.readings) {
  const key = `${incoming.dataloggerCode}:${r.time}`;
  if (!map.has(key)) map.set(key, r);
}
```

## 8) Fallback khi SSE khong on dinh

Neu mang di dong/ISP khong on dinh, bat fallback polling:

- moi 3-10 giay goi:
  - `GET /api/v1/datalogger/{dataloggerCode}/readings?from=<lastProcessedTime>&order=asc&limit=...`
- merge ket qua vao UI theo dedupe rule.

## 9) Checklist truoc khi release frontend

- Da gui `X-API-Key` dung cho stream request.
- Co reconnect strategy (backoff) khi disconnect.
- Co luu/restore `lastEventTime` khi app reload.
- Co xu ly `reading.backfill` de khong mat du lieu.
- Co dedupe theo `reading.time`.
- Co fallback polling cho thiet bi/mang dac biet (neu can).

