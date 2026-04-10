# Hướng dẫn tích hợp Webhook Datalogger

Tài liệu dành cho **đội kỹ thuật tại nhà máy / đơn vị vận hành** khi tích hợp hệ thống gửi dữ liệu đồng hồ (áp lực P, lưu lượng/tích Q, mực nước H, thông tin bổ sung) lên dịch vụ webhook của IOC.

---

## 1. Mục đích

Dịch vụ hỗ trợ:

- **Thông tin thiết bị**: đăng ký, cập nhật, xóa mềm theo **mã datalogger**; **đọc danh sách** thiết bị (phân trang).
- **Dữ liệu đo theo thời gian**: gửi **bulk** (nhiều điểm `(time, p/q/h/AdditionalDetails)` trong một lần gọi); **đọc lại** theo thiết bị (lọc thời gian tùy chọn).

Hệ thống phía nhà máy (SCADA, gateway, script, dịch vụ trung gian…) gọi **HTTP API** với **JSON** và **API key** được cấp. Các API **đọc** (GET) dùng cho tra cứu, dashboard hoặc kiểm tra sau tích hợp — cùng cơ chế xác thực `X-API-Key` như API ghi.

---

## 2. Thông tin cần nhận từ bộ phận IT / IOC

Trước khi tích hợp, xin xác nhận:

| Thông tin | Ví dụ | Ghi chú |
|-----------|--------|---------|
| **Base URL** | `https://api-uat-datalogger.systemswater.net`  (môi trường thử), **không** có `/` ở cuối khi ghép path |
| **API key** | Chuỗi bí mật do server cấu hình | Giữ kín, không đưa vào mã nguồn công khai |
| **Môi trường** | UAT / Production | URL và key có thể khác nhau |
| **Swagger (OpenAPI)** | `{BASE_URL}/docs` | Giao diện xem API, schema request/response; file JSON: `{BASE_URL}/docs/json` |

Toàn bộ API nghiệp vụ nằm dưới prefix: **`/api/v1`**.

### 2.1. Swagger UI — tra cứu & thử API

Trên server đã triển khai dịch vụ, mở trình duyệt tại:

- **`GET /docs`** — Swagger UI (danh sách endpoint, mô tả, nút **Try it out**).
- **`GET /docs/json`** — bản OpenAPI 3.0 (JSON) để import vào Postman / Insomnia nếu cần.

**Thử nghiệm có xác thực:** trong Swagger, bấm **Authorize** (hoặc nhập header), điền API key cho scheme **`X-API-Key`**, sau đó gọi các API dưới `/api/v1`. Endpoint **`GET /health`** không cần key.

> Lưu ý: không đưa API key production vào máy hoặc tài khoản không được phép; ưu tiên môi trường UAT khi thử.

---

## 3. Giao thức & định dạng

- **Phương thức**: HTTP/HTTPS (production nên dùng **HTTPS**).
- **Nội dung**: với request có body JSON, dùng header `Content-Type: application/json; charset=utf-8`. Các request **GET** không có body; tham số truyền qua **query string** (xem mục 6, 7).
- **Mã hóa**: JSON dùng **UTF-8** (tiếng Việt trong tên thiết bị là hợp lệ).

---

## 4. Xác thực

Mọi request tới **`/api/v1/*`** cần header:

```http
X-API-Key: <API_KEY được cấp>
```

- Không có hoặc sai key → **401 Unauthorized** với body dạng JSON: `{ "error": "Unauthorized" }`.
- Key có thể là một trong nhiều key được cấu hình trên server (nếu IOC cấp nhiều key cho nhiều đơn vị).

**Endpoint kiểm tra sống** (health) **không** yêu cầu API key:

| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|--------|
| `GET` | `/health` | Trả về `{ "status": "ok" }` khi dịch vụ chạy |

Dùng để kiểm tra firewall, DNS, load balancer (không thay thế xác thực nghiệp vụ).

---

## 5. Danh sách API nghiệp vụ

| Mục đích | Phương thức | Đường dẫn đầy đủ |
|----------|-------------|------------------|
| Danh sách thiết bị (phân trang) | `GET` | `{BASE_URL}/api/v1/devices` |
| Đăng ký thiết bị | `POST` | `{BASE_URL}/api/v1/devices` |
| Cập nhật thiết bị | `PATCH` | `{BASE_URL}/api/v1/devices/{dataloggerCode}` |
| Xóa mềm thiết bị | `DELETE` | `{BASE_URL}/api/v1/devices/{dataloggerCode}` |
| Đọc dữ liệu đo theo thiết bị | `GET` | `{BASE_URL}/api/v1/datalogger/{dataloggerCode}/readings` |
| Gửi dữ liệu đo (bulk) | `POST` | `{BASE_URL}/api/v1/datalogger/readings` |

`{dataloggerCode}` trong URL là **mã datalogger** (ví dụ `140017`), nên dùng ký tự an toàn cho URL; nếu có ký tự đặc biệt, cần **encode** (percent-encoding).

---

## 6. Danh sách thiết bị — `GET /api/v1/devices`

Trả về các thiết bị **chưa xóa mềm**, sắp xếp theo `dataloggerCode` tăng dần.

**Query (tùy chọn)**:

| Tham số | Mặc định | Giới hạn | Mô tả |
|---------|----------|----------|--------|
| `limit` | `100` | 1–500 | Số bản ghi tối đa mỗi trang |
| `offset` | `0` | ≥ 0 | Bỏ qua N bản ghi đầu (phân trang) |

**Phản hồi** (`200`): ví dụ

```json
{
  "total": 42,
  "limit": 100,
  "offset": 0,
  "items": [ { "id": "…", "dataloggerCode": "140017", "name": "…", … } ]
}
```

- `total`: tổng số thiết bị active (không xóa mềm), không phụ thuộc `limit`/`offset`.

**Lỗi**: `400` — `limit`/`offset` không hợp lệ.

---

## 7. Đọc dữ liệu đo — `GET /api/v1/datalogger/{dataloggerCode}/readings`

Đọc các điểm đo theo thời gian cho một thiết bị (dùng cho báo cáo, kiểm tra, dashboard). Mỗi điểm luôn có `time`, các trường `p`, `q`, `h`, `AdditionalDetails` là tùy chọn theo loại dữ liệu nguồn.

**Query (tùy chọn)**:

| Tham số | Mặc định | Mô tả |
|---------|----------|--------|
| `from` | (không) | Thời điểm bắt đầu (**≥**), ISO-8601 có timezone (khuyến nghị) |
| `to` | (không) | Thời điểm kết thúc (**≤**), ISO-8601 có timezone |
| `limit` | `100` | Số điểm tối đa trả về (tối đa bằng `MAX_READINGS_PER_REQUEST` trên server) |
| `order` | `desc` | `asc` = cũ → mới, `desc` = mới → cũ |

**Phản hồi** (`200`): ví dụ

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
      "AdditionalDetails": { "unitQ": "m3/h", "source": "SCADA" }
    },
    {
      "time": "2026-04-06T04:25:31.000Z",
      "h": 1.64,
      "AdditionalDetails": { "note": "H from field sensor" }
    }
  ]
}
```

**Lỗi**:

- `400` — query không hợp lệ, hoặc `from` sau `to`.
- `404` — không có thiết bị với mã đó, hoặc thiết bị đã **xóa mềm**.

> Gợi ý: tham số thời gian nên dùng **ISO-8601 có timezone** (nhất quán với mục 12). API đọc không hỗ trợ định dạng `dd/MM/yyyy` như API gửi bulk — chỉ dùng ISO cho `from`/`to`.

---

## 8. Đăng ký thiết bị — `POST /api/v1/devices`

**Body (JSON)** — các trường tùy chọn có thể bỏ hoặc gửi `null`:

| Trường | Kiểu | Mô tả |
|--------|------|--------|
| `dataloggerCode` | string, **bắt buộc** | Mã định danh datalogger (duy nhất trên hệ thống) |
| `name` | string \| null | Tên mô tả (vd: tuyến, vị trí) |
| `areaCode` | string \| null | Mã khu vực |
| `pressureMax`, `pressureMin` | number \| null | Áp lực max/min (đơn vị theo thống nhất nội bộ, vd bar) |
| `lat`, `lon` | number \| null | Tọa độ |
| `meterCode` | string \| null | Mã đồng hồ |
| `meterTypeName` | string \| null | Tên loại đồng hồ (vd: Siemens) |
| `meterSizeCode` | string \| null | Mã kích cỡ đồng hồ |
| `deviceType` | string \| null | Loại thiết bị (vd: Đồng hồ điện tử) |
| `productionYear`, `usageYear` | string \| null | Có thể dùng chuỗi như `N/A` |

**Phản hồi thành công**: `201 Created` — body là object thiết bị (có `id` dạng UUID, thời gian `createdAt`, …).

**Lỗi thường gặp**:

- `409` — đã tồn tại `dataloggerCode` (cần dùng PATCH hoặc đổi mã).

---

## 9. Cập nhật thiết bị — `PATCH /api/v1/devices/{dataloggerCode}`

Chỉ gửi các trường cần sửa (partial update). Kiểu trường giống bảng ở mục 8 (không gửi `dataloggerCode` trong body).

**Phản hồi**: `200 OK` — body thiết bị sau cập nhật.  
**`404`** — không tìm thấy thiết bị hoặc đã xóa mềm (tùy logic hiện tại).

---

## 10. Xóa mềm — `DELETE /api/v1/devices/{dataloggerCode}`

**Phản hồi**: `204 No Content` khi thành công.  
**`404`** — không tìm thấy bản ghi active.

Gửi lại dữ liệu đo với cùng `dataloggerCode` sau này có thể được hệ thống xử lý theo chính sách khôi phục — cần thống nhất với IOC nếu cần hành vi cụ thể.

---

## 11. Gửi dữ liệu đo — `POST /api/v1/datalogger/readings`

Đây là API **chính** cho tích hợp định kỳ (mỗi phút / mỗi batch).

**Body (JSON)**:

| Trường | Bắt buộc | Mô tả |
|--------|----------|--------|
| `dataloggerCode` | Có | Trùng với mã thiết bị trên hệ thống |
| `readings` | Có | Mảng ít nhất 1 phần tử |
| `device` | Không | Metadata bổ sung khi **chưa** có thiết bị: server có thể **tự tạo** bản ghi thiết bị |

Mỗi phần tử trong `readings`:

| Trường | Kiểu | Mô tả |
|--------|------|--------|
| `time` | string, **bắt buộc** | Thời điểm đo — xem **mục 12** |
| `p` | number \| null | Áp lực (tùy chọn) |
| `q` | number \| null | Giá trị Q (tùy chọn) |
| `h` | number \| null | Mực nước H (tùy chọn) |
| `AdditionalDetails` | object \| null | Thông tin bổ sung dạng JSON (tùy chọn) |

**Phản hồi thành công** (`201`): ví dụ

```json
{
  "dataloggerCode": "140017",
  "deviceId": "uuid-của-thiết-bị",
  "inserted": 120,
  "received": 120
}
```

- `received`: số điểm trong request.  
- `inserted`: số dòng thực sự ghi thêm (có thể **nhỏ hơn** nếu trùng thời điểm — xem mục 13).

**Lỗi**:

- `400` — JSON không hợp lệ, sai định dạng thời gian, hoặc vượt giới hạn số điểm mỗi request (cấu hình `MAX_READINGS_PER_REQUEST` phía server).

---

## 12. Định dạng thời gian (`time`)

Hỗ trợ:

1. **ISO-8601 có timezone** (khuyến nghị), ví dụ:  
   `2026-04-06T11:26:31+07:00`
2. Chuỗi **`dd/MM/yyyy HH:mm:ss`** — được hiểu theo múi giờ **`Asia/Ho_Chi_Minh`**, ví dụ:  
   `06/04/2026 11:26:31`

Server lưu dạng thời gian có timezone trong CSDL; nên thống nhất một cách gửi để dễ hỗ trợ.

---

## 13. Gửi trùng thời điểm (idempotent)

Nếu cùng một thiết bị gửi lại **cùng một `time`**, hệ thống **không ghi đè** — dòng trùng bị bỏ qua. Khi đó `inserted` có thể bằng `0` dù `received` ≥ 1.  
Điều này giúp an toàn khi gửi lại batch do lỗi mạng.

---

## 14. Giới hạn batch

Số phần tử tối đa trong `readings` mỗi request do server cấu hình (mặc định thường là vài nghìn). Nếu vượt quá → `400`.  
Khi có nhiều điểm, chia nhỏ theo khung thời gian hoặc theo số điểm an toàn (vd: 500–1000 điểm/lần) sau khi xác nhận với IOC.

---

## 15. Luồng tích hợp gợi ý

1. **Kiểm tra kết nối**: `GET /health` (monitoring).  
2. **Đăng ký thiết bị** một lần qua `POST /api/v1/devices` (hoặc đảm bảo đã có trên hệ thống IOC).  
3. **Định kỳ** gọi `POST /api/v1/datalogger/readings` với batch đo gần nhất.  
4. Nếu chưa kịp đăng ký thiết bị: có thể gửi kèm object `device` trong body readings để server tạo thiết bị tự động (vẫn nên **đăng ký đầy đủ** khi có điều kiện).  
5. (Tùy chọn) **Kiểm tra phía đọc**: `GET /api/v1/devices` để xác nhận thiết bị đã có; `GET /api/v1/datalogger/{dataloggerCode}/readings` để đối soát dữ liệu đã ghi.

---

## 16. Ví dụ `curl`

Thay `BASE_URL` và `YOUR_API_KEY` bằng giá trị thực tế.

**Danh sách thiết bị (trang đầu, 20 bản ghi):**

```bash
curl -s -G "${BASE_URL}/api/v1/devices" \
  -H "X-API-Key: YOUR_API_KEY" \
  --data-urlencode "limit=20" \
  --data-urlencode "offset=0"
```

**Đọc dữ liệu đo (mới nhất trước, tối đa 50 điểm):**

```bash
curl -s -G "${BASE_URL}/api/v1/datalogger/140017/readings" \
  -H "X-API-Key: YOUR_API_KEY" \
  --data-urlencode "limit=50" \
  --data-urlencode "order=desc"
```

**Đọc dữ liệu trong khoảng thời gian (ISO-8601):**

```bash
curl -s -G "${BASE_URL}/api/v1/datalogger/140017/readings" \
  -H "X-API-Key: YOUR_API_KEY" \
  --data-urlencode "from=2026-04-06T00:00:00+07:00" \
  --data-urlencode "to=2026-04-06T23:59:59+07:00" \
  --data-urlencode "order=asc"
```

**Gửi dữ liệu đo:**

```bash
curl -s -X POST "${BASE_URL}/api/v1/datalogger/readings" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "dataloggerCode": "140017",
    "readings": [
      {
        "time": "2026-04-06T11:26:31+07:00",
        "p": 3.71,
        "q": 244,
        "AdditionalDetails": {
          "unitP": "bar",
          "unitQ": "m3/h",
          "station": "SVWMGE-DT16"
        }
      },
      {
        "time": "06/04/2026 11:25:31",
        "h": 1.64,
        "AdditionalDetails": {
          "unitH": "m",
          "remark": "water level only"
        }
      }
    ]
  }'
```

**Đăng ký thiết bị:**

```bash
curl -s -X POST "${BASE_URL}/api/v1/devices" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
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

---

## 17. Bảo mật & vận hành

- **Không** ghi API key vào log ứng dụng, screenshot, ticket công khai.  
- Ưu tiên **HTTPS** và kiểm tra chứng chỉ ở production.  
- Nếu key bị lộ, yêu cầu IOC **thu hồi / đổi key** và cập nhật cấu hình phía nhà máy.  
- Nên có **cơ chế retry** có giới hạn (backoff) khi `5xx` hoặc lỗi mạng; với `4xx` cần đọc nội dung lỗi trước khi gửi lại vô hạn.

---

## 18. Checklist trước khi go-live

- [ ] Đã có `BASE_URL` và `API key` đúng môi trường.  
- [ ] Firewall / VPN cho phép máy chủ gateway ra được `BASE_URL` (port 443 hoặc port HTTP đã thống nhất).  
- [ ] Đã thử `GET /health` và `POST /api/v1/datalogger/readings` với vài điểm thử.  
- [ ] (Tùy chọn) Đã thử `GET /api/v1/devices` và `GET /api/v1/datalogger/{mã}/readings` để đối soát.  
- [ ] Đã thống nhất đơn vị và ý nghĩa các trường **p**, **q**, **h** và cấu trúc **AdditionalDetails** với IOC.  
- [ ] Đã xác định tần suất gửi và kích thước batch phù hợp.

---

## 19. Liên hệ

Mọi thay đổi URL, key, hoặc hỗ trợ lỗi tích hợp — **liên hệ bộ phận IT / đội vận hành IOC** theo kênh nội bộ đơn vị (cập nhật email/Slack/đầu mối tại đây khi có quy định).

---

*Tài liệu phản ánh hành vi API tại thời điểm biên soạn. Khi server nâng cấp, IOC sẽ thông báo thay đổi breaking nếu có.*
