# Technical Service Contract (Swagger-Aligned)

Tài liệu này là chuẩn kỹ thuật dành cho developer triển khai service/client khác tương thích với API hiện tại.
Nguồn sự thật (source of truth) là Swagger/OpenAPI của service tại `/docs` và định nghĩa schema trong `src/openapi/schemas.ts`.

## 1) Contract Baseline

- API version prefix: `/api/v1`
- Swagger UI: `/docs`
- OpenAPI JSON: `/docs/json`
- Content type cho request có body: `application/json; charset=utf-8`

### Authentication Contract

- Security scheme: API key qua header `X-API-Key`
- Áp dụng cho toàn bộ endpoint nghiệp vụ dưới `/api/v1/*`
- Ngoại lệ không cần API key: `GET /health`
- Thiếu hoặc sai key: `401 Unauthorized`

## 2) Endpoint Contract Matrix

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | No | Kiểm tra service sống |
| GET | `/api/v1/devices` | Yes | Danh sách thiết bị (phân trang) |
| POST | `/api/v1/devices` | Yes | Tạo thiết bị mới theo `dataloggerCode` |
| PATCH | `/api/v1/devices/{dataloggerCode}` | Yes | Cập nhật một phần thông tin thiết bị |
| DELETE | `/api/v1/devices/{dataloggerCode}` | Yes | Xóa mềm thiết bị |
| GET | `/api/v1/datalogger/{dataloggerCode}/readings` | Yes | Lấy điểm đo theo thời gian |
| POST | `/api/v1/datalogger/readings` | Yes | Gửi dữ liệu đo bulk |

## 3) Global Validation Rules

- JSON kiểu nullable dùng pattern `type: ["<type>", "null"]`
- `dataloggerCode`:
  - Bắt buộc khi tạo device và khi ingest readings
  - `minLength: 1`
- Mọi query/path param phải đúng kiểu theo schema, sai kiểu trả `400`
- `dataloggerCode` trên path cần URL-encode nếu có ký tự đặc biệt

## 4) Device Contract

### 4.1 Device Fields

`Device` object dùng cho create/update/response (trừ một số field hệ thống):

- `dataloggerCode: string` (required khi create)
- `name, areaCode, meterCode, meterTypeName, meterSizeCode, deviceType, productionYear, usageYear: string | null`
- `pressureMax, pressureMin, lat, lon: number | null`

Field hệ thống trong response:

- `id: string (uuid)`
- `createdAt: string (date-time)`
- `updatedAt: string (date-time)`
- `deletedAt: string (date-time) | null`

### 4.2 GET `/api/v1/devices`

Query schema:

- `limit: integer` (default `100`, min `1`, max `500`)
- `offset: integer` (default `0`, min `0`)

`200` response:

```json
{
  "total": 0,
  "limit": 100,
  "offset": 0,
  "items": [
    {
      "id": "uuid",
      "dataloggerCode": "140017",
      "name": null,
      "areaCode": null,
      "pressureMax": null,
      "pressureMin": null,
      "lat": null,
      "lon": null,
      "meterCode": null,
      "meterTypeName": null,
      "meterSizeCode": null,
      "deviceType": null,
      "productionYear": null,
      "usageYear": null,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "deletedAt": null
    }
  ]
}
```

Error contract:

- `400`: query không hợp lệ (`limit/offset`)
- `401`: thiếu hoặc sai `X-API-Key`

### 4.3 POST `/api/v1/devices`

Body schema:

- Required: `dataloggerCode`
- Optional: toàn bộ field device còn lại theo nullable rules

Response contract:

- `201`: trả về object device đầy đủ
- `400`: body không hợp lệ
- `401`: thiếu hoặc sai API key
- `409`: trùng `dataloggerCode`

### 4.4 PATCH `/api/v1/devices/{dataloggerCode}`

Path schema:

- `dataloggerCode: string` (required)

Body schema:

- Partial update: chỉ gồm field metadata, không có `dataloggerCode` trong body

Response contract:

- `200`: object device sau cập nhật
- `400`: body không hợp lệ
- `401`: thiếu hoặc sai API key
- `404`: không tìm thấy thiết bị

### 4.5 DELETE `/api/v1/devices/{dataloggerCode}`

Path schema:

- `dataloggerCode: string` (required)

Response contract:

- `204`: xóa mềm thành công, không có body
- `401`: thiếu hoặc sai API key
- `404`: không tìm thấy

## 5) Readings Contract

### 5.1 Reading Point Schema

Mỗi phần tử trong `readings[]`:

- `time: string` (required)
  - Hỗ trợ:
    - ISO-8601 có timezone (khuyến nghị)
    - `dd/MM/yyyy HH:mm:ss` (interpret theo `Asia/Ho_Chi_Minh`)
- `p: number | null`
- `q: number | null`
- `h: number | null`
- `AdditionalDetails: object | null` (additionalProperties: true)
- `additionalDetails: object | null` (alias camelCase của `AdditionalDetails`)

Lưu ý tương thích:

- Service nhận cả `AdditionalDetails` và `additionalDetails`; khi implement client mới nên chuẩn hóa một kiểu duy nhất ở outbound payload để tránh drift.

### 5.2 GET `/api/v1/datalogger/{dataloggerCode}/readings`

Path schema:

- `dataloggerCode: string` (required)

Query schema:

- `from: string (date-time, ISO-8601)` optional
- `to: string (date-time, ISO-8601)` optional
- `limit: integer` (default `100`, min `1`, max = `MAX_READINGS_PER_REQUEST`)
- `order: "asc" | "desc"` (default `desc`)

`200` response:

```json
{
  "dataloggerCode": "140017",
  "count": 2,
  "readings": [
    {
      "time": "2026-04-06T04:26:31.000Z",
      "p": 3.71,
      "q": 244,
      "h": null,
      "AdditionalDetails": { "source": "SCADA" }
    }
  ]
}
```

Error contract:

- `400`: query không hợp lệ (`from/to/limit/order`)
- `401`: thiếu hoặc sai API key
- `404`: không có thiết bị hoặc thiết bị đã xóa mềm

### 5.3 POST `/api/v1/datalogger/readings`

Body schema:

- `dataloggerCode: string` (required, minLength `1`)
- `readings: readingPoint[]` (required, minItems `1`)
- `device: object` (optional metadata để auto-create/patch khi ingest)

`201` response:

```json
{
  "dataloggerCode": "140017",
  "deviceId": "uuid",
  "inserted": 120,
  "received": 120
}
```

Error contract:

- `400`: validation body, time format invalid, vượt batch max
- `401`: thiếu hoặc sai API key

## 6) Behavioral Contract (Non-Structural)

- Idempotency ingest: duplicate theo cặp `(device_id, time)` bị bỏ qua, không overwrite
- `inserted` có thể nhỏ hơn `received` khi có duplicate
- `GET /api/v1/devices` trả về thiết bị chưa xóa mềm
- `DELETE` là soft delete, không phải hard delete

## 7) Standard Error Envelope

Error payload dùng object dạng:

```json
{
  "error": "message or validation details"
}
```

Trong một số trường hợp validation/runtime, `error` có thể là object thay vì string.
Client/service khác phải parse được cả hai dạng:

- `error: string`
- `error: object`

## 8) Compatibility Checklist For External Services

Checklist bắt buộc trước khi tích hợp chính thức:

- Dùng đúng base path `/api/v1` và gửi header `X-API-Key` cho toàn bộ endpoint nghiệp vụ.
- Validate outbound payload theo nullable/required rules trước khi gọi API.
- Với ingest, đảm bảo mỗi request không vượt giới hạn `MAX_READINGS_PER_REQUEST` của môi trường đích.
- Chuẩn hóa định dạng `time` (ưu tiên ISO-8601 có timezone) ở service nguồn.
- Parse được error envelope có `error` là string hoặc object.
- Xử lý chính xác các status code hợp đồng: `200/201/204/400/401/404/409`.
- Không giả định `inserted === received` khi gửi readings.
- Nếu dùng `additionalDetails`, xác nhận mapping tương thích với `AdditionalDetails` ở phía server.

## 9) Contract Governance

Để tránh lệch chuẩn giữa các service:

- Swagger/OpenAPI tại `/docs` là chuẩn chính thức khi có khác biệt với tài liệu mô tả.
- Mọi thay đổi breaking của schema/response code cần được version hóa API hoặc công bố rõ ràng trước khi rollout.
- Khi phát triển service mới, luôn chạy contract verification theo checklist ở mục 8 trên môi trường UAT trước production.
