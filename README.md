# Webhook datalogger API

Service nhỏ (Fastify + TypeScript + TimescaleDB) nhận đăng ký thiết bị và dữ liệu đo đồng hồ (P/Q) theo thời gian. Xác thực Quawaco bằng header `X-API-Key`.

**Tích hợp phía nhà máy / đối tác:** xem [docs/HUONG_DAN_TICH_HOP_WEBHOOK.md](docs/HUONG_DAN_TICH_HOP_WEBHOOK.md). **Swagger UI:** sau khi chạy server, mở [http://localhost:3000/docs](http://localhost:3000/docs) (OpenAPI JSON: `/docs/json`). **Đồng bộ full lên IOC:** `POST /api/v1/sync/push-all` (cần `FALLBACK_API_KEY` hợp lệ trên `https://datalogger-webhook.iclever.vn`).

**Triển khai VPS (SSH + Docker):** [docs/DEPLOY_VPS.md](docs/DEPLOY_VPS.md) — `npm run deploy:vps`. Production **không** publish cổng API ra host; truy cập qua reverse proxy hoặc `docker compose exec api …` (xem tài liệu).

## Yêu cầu

- Node.js 20+
- PostgreSQL với extension **TimescaleDB** (khuyến nghị dùng `docker compose` trong repo)

## Cấu hình

Copy `.env.example` thành `.env` và chỉnh giá trị:

| Biến | Mô tả |
|------|--------|
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL/Timescale |
| `QUAWACO_API_KEYS` | Một hoặc nhiều API key, phân tách bằng dấu phẩy |
| `PORT` | Cổng HTTP (mặc định 3000) |
| `MAX_READINGS_PER_REQUEST` | Giới hạn số điểm đo mỗi request (mặc định 5000) |
| `FALLBACK_WEBHOOK_URL` | (Tuỳ chọn) Base URL IOC để mirror sau khi ghi local thành công, vd. `https://datalogger-webhook.iclever.vn` |
| `FALLBACK_API_KEY` | (Tuỳ chọn) `X-API-Key` cho mirror sang `FALLBACK_WEBHOOK_URL`; **bắt buộc** nếu gọi `POST /api/v1/sync/push-all` (đích cố định iclever.vn) |

## Chạy local

1. **Docker Desktop** phải đang chạy. Khởi TimescaleDB:

   ```bash
   docker compose up -d timescaledb
   ```

   Đợi vài giây đến khi `pg_isready` OK (container `healthy`).

2. **Cấu hình env**: copy `.env.example` → `.env` (file `.env` không commit; đã có sẵn giá trị local mặc định):

   ```bash
   cp -n .env.example .env
   ```

   `DATABASE_URL` mặc định trỏ `localhost:5432` trùng với `docker-compose.yml` (`postgres` / `postgres`, DB `datalogger`).

3. Cài dependency và **migrate** (bắt buộc lần đầu hoặc sau khi đổi SQL):

   ```bash
   npm install
   npm run migrate
   ```

   Script `migrate` dùng `node --env-file=.env` (Node 20+), cần có file `.env`.

4. Chạy API (`npm run dev` cũng nạp `.env` qua `--env-file`):

   ```bash
   npm run dev
   ```

5. Kiểm tra nhanh:

   ```bash
   curl -s http://localhost:3000/health
   npm run test:smoke
   ```

   Smoke test cần server đang chạy và cùng `QUAWACO_API_KEYS` với `.env` (mặc định `dev-key-change-me`).

## API (tất cả route dưới đây cần `X-API-Key`)

### Đăng ký thiết bị

`POST /api/v1/devices`

```bash
curl -s -X POST http://localhost:3000/api/v1/devices \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key-change-me" \
  -d '{
    "dataloggerCode": "140017",
    "name": "QY23-D315 - Yên Lập - CN Đông Mai",
    "areaCode": "BC06",
    "pressureMax": 3.8,
    "pressureMin": 2.5,
    "lat": 21.001124,
    "lon": 106.883711,
    "meterCode": "257803H180",
    "meterTypeName": "Siemens",
    "meterSizeCode": "300",
    "deviceType": "Đồng hồ điện tử",
    "productionYear": "N/A",
    "usageYear": "N/A"
  }'
```

### Cập nhật thiết bị

`PATCH /api/v1/devices/:dataloggerCode`

```bash
curl -s -X PATCH http://localhost:3000/api/v1/devices/140017 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key-change-me" \
  -d '{ "pressureMax": 4.0 }'
```

### Xóa (soft delete)

`DELETE /api/v1/devices/:dataloggerCode`

```bash
curl -s -X DELETE http://localhost:3000/api/v1/devices/140017 \
  -H "X-API-Key: dev-key-change-me" -i
```

### Gửi dữ liệu đo (bulk)

`POST /api/v1/datalogger/readings`

- Nếu chưa có thiết bị với `dataloggerCode`, hệ thống **tự tạo** bản ghi thiết bị (có thể kèm object `device` để điền metadata).
- Mỗi điểm: `time` là **ISO-8601** (khuyến nghị, có timezone) hoặc chuỗi `dd/MM/yyyy HH:mm:ss` (hiểu là `Asia/Ho_Chi_Minh`).
- Trùng `(device_id, time)` sẽ bị bỏ qua (idempotent).

```bash
curl -s -X POST http://localhost:3000/api/v1/datalogger/readings \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key-change-me" \
  -d '{
    "dataloggerCode": "140017",
    "device": {
      "name": "QY23-D315 - Yên Lập - CN Đông Mai",
      "areaCode": "BC06"
    },
    "readings": [
      { "time": "2026-04-06T11:26:31+07:00", "p": 3.71, "q": 244 },
      { "time": "06/04/2026 11:25:31", "p": 3.71, "q": 242 }
    ]
  }'
```

## Docker (API + TimescaleDB)

```bash
export QUAWACO_API_KEYS=your-production-key
docker compose up --build
```

API lắng nghe cổng `3000`. Container API chạy `migrate:prod` trước khi start.

## Lưu trữ theo thời gian

- Bảng `datalogger_readings` là **hypertable** TimescaleDB, index `(device_id, time DESC)`.
- Nén chunk sau 7 ngày (cấu hình trong migration).

## Scripts

| Script | Mô tả |
|--------|--------|
| `npm run dev` | Dev server (`tsx watch`) |
| `npm run build` | Biên dịch TypeScript → `dist/` |
| `npm run start` | Chạy `node dist/src/index.js` |
| `npm run migrate` | Chạy file SQL trong `src/db/migrations/` |
| `npm run migrate:prod` | Migrate từ bản build (`dist/scripts/migrate.js`) |
| `npm run test:smoke` | Gọi API thử với dữ liệu mẫu (cần DB + server: xem `scripts/smoke-api.sh`) |
