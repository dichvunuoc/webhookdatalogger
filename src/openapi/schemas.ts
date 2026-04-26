/** JSON Schema cho Fastify route schema + OpenAPI (nhà máy xem tại /docs). */

const nullableString = { type: ["string", "null"] as const };
const nullableNumber = { type: ["number", "null"] as const };
const nullableObject = {
  type: ["object", "null"] as const,
  additionalProperties: true,
};

export const deviceProperties = {
  dataloggerCode: {
    type: "string",
    minLength: 1,
    description: "Mã định danh datalogger (duy nhất)",
  },
  name: { ...nullableString, description: "Tên / vị trí thiết bị" },
  areaCode: { ...nullableString, description: "Mã khu vực" },
  pressureMax: { ...nullableNumber, description: "Áp lực max" },
  pressureMin: { ...nullableNumber, description: "Áp lực min" },
  lat: { ...nullableNumber, description: "Vĩ độ" },
  lon: { ...nullableNumber, description: "Kinh độ" },
  meterCode: { ...nullableString, description: "Mã đồng hồ" },
  meterTypeName: { ...nullableString, description: "Tên loại đồng hồ" },
  meterSizeCode: { ...nullableString, description: "Mã kích cỡ đồng hồ" },
  deviceType: { ...nullableString, description: "Loại thiết bị" },
  productionYear: { ...nullableString, description: "Năm sản xuất (có thể N/A)" },
  usageYear: { ...nullableString, description: "Năm sử dụng (có thể N/A)" },
} as const;

export const deviceResponseProperties = {
  id: { type: "string", format: "uuid" },
  ...deviceProperties,
  createdAt: { type: "string", format: "date-time" },
  updatedAt: { type: "string", format: "date-time" },
  deletedAt: { type: ["string", "null"], format: "date-time" },
} as const;

const errorBody = {
  type: "object",
  description: "Lỗi validation hoặc thông báo ngắn",
  properties: {
    error: {
      oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }],
    },
  },
} as const;

export const healthSchema = {
  tags: ["Health"],
  summary: "Kiểm tra dịch vụ sống",
  description: "Không cần header X-API-Key.",
  response: {
    200: {
      description: "OK",
      type: "object",
      properties: {
        status: { type: "string", enum: ["ok"] },
      },
    },
  },
} as const;

export const getDevicesListSchema = {
  tags: ["Devices"],
  summary: "Danh sách thiết bị",
  description:
    "Trả về thiết bị chưa xóa mềm, sắp xếp theo `dataloggerCode`. Phân trang bằng `limit` và `offset`.",
  security: [{ apiKey: [] }],
  querystring: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 500,
        default: 100,
        description: "Số bản ghi tối đa mỗi trang",
      },
      offset: {
        type: "integer",
        minimum: 0,
        default: 0,
        description: "Bỏ qua N bản ghi đầu (phân trang)",
      },
    },
  },
  response: {
    200: {
      description: "Danh sách và tổng số bản ghi (không xóa)",
      type: "object",
      properties: {
        total: { type: "integer", minimum: 0 },
        limit: { type: "integer" },
        offset: { type: "integer" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: deviceResponseProperties,
          },
        },
      },
    },
    400: { ...errorBody, description: "Query không hợp lệ (limit/offset)" },
    401: { description: "Thiếu hoặc sai X-API-Key" },
  },
} as const;

export const postDeviceSchema = {
  tags: ["Devices"],
  summary: "Đăng ký thiết bị",
  description: "Tạo bản ghi thiết bị mới. `dataloggerCode` phải chưa tồn tại.",
  security: [{ apiKey: [] }],
  body: {
    type: "object",
    required: ["dataloggerCode"],
    properties: deviceProperties,
  },
  response: {
    201: {
      description: "Đã tạo",
      type: "object",
      properties: deviceResponseProperties,
    },
    400: { ...errorBody, description: "Body không hợp lệ" },
    401: { description: "Thiếu hoặc sai X-API-Key" },
    409: {
      description: "Trùng dataloggerCode",
      type: "object",
      properties: { error: { type: "string" } },
    },
  },
} as const;

export const patchDeviceSchema = {
  tags: ["Devices"],
  summary: "Cập nhật thiết bị",
  description: "Cập nhật một phần trường theo `dataloggerCode` trên URL.",
  security: [{ apiKey: [] }],
  params: {
    type: "object",
    required: ["dataloggerCode"],
    properties: {
      dataloggerCode: {
        type: "string",
        description: "Mã datalogger (URL-encoded nếu có ký tự đặc biệt)",
      },
    },
  },
  body: {
    type: "object",
    properties: {
      name: deviceProperties.name,
      areaCode: deviceProperties.areaCode,
      pressureMax: deviceProperties.pressureMax,
      pressureMin: deviceProperties.pressureMin,
      lat: deviceProperties.lat,
      lon: deviceProperties.lon,
      meterCode: deviceProperties.meterCode,
      meterTypeName: deviceProperties.meterTypeName,
      meterSizeCode: deviceProperties.meterSizeCode,
      deviceType: deviceProperties.deviceType,
      productionYear: deviceProperties.productionYear,
      usageYear: deviceProperties.usageYear,
    },
  },
  response: {
    200: {
      description: "Đã cập nhật",
      type: "object",
      properties: deviceResponseProperties,
    },
    400: { ...errorBody, description: "Body không hợp lệ" },
    401: { description: "Thiếu hoặc sai X-API-Key" },
    404: {
      description: "Không tìm thấy thiết bị",
      type: "object",
      properties: { error: { type: "string" } },
    },
  },
} as const;

export const deleteDeviceSchema = {
  tags: ["Devices"],
  summary: "Xóa mềm thiết bị",
  description: "Đánh dấu xóa (soft delete) theo mã datalogger.",
  security: [{ apiKey: [] }],
  params: {
    type: "object",
    required: ["dataloggerCode"],
    properties: {
      dataloggerCode: { type: "string", description: "Mã datalogger" },
    },
  },
  response: {
    204: { description: "Đã xóa", type: "null" },
    401: { description: "Thiếu hoặc sai X-API-Key" },
    404: {
      description: "Không tìm thấy",
      type: "object",
      properties: { error: { type: "string" } },
    },
  },
} as const;

const readingPoint = {
  type: "object",
  required: ["time"],
  properties: {
    time: {
      type: "string",
      description:
        "ISO-8601 có timezone (khuyến nghị) hoặc dd/MM/yyyy HH:mm:ss (Asia/Ho_Chi_Minh)",
    },
    p: { ...nullableNumber, description: "Áp lực P (tùy chọn theo loại điểm đo)" },
    q: { ...nullableNumber, description: "Giá trị Q (tùy chọn theo loại điểm đo)" },
    h: { ...nullableNumber, description: "Mực nước H (tùy chọn theo loại điểm đo)" },
    AdditionalDetails: {
      ...nullableObject,
      description:
        "Thông tin bổ sung dạng JSON object (tùy chọn). Có thể dùng `additionalDetails` (camelCase) thay thế — server map sang cùng trường.",
    },
    additionalDetails: {
      ...nullableObject,
      description: "Alias camelCase của `AdditionalDetails` (tùy chọn).",
    },
  },
} as const;

const devicePatchIngest = {
  type: "object",
  description: "Metadata khi tự tạo thiết bị lúc ingest (tùy chọn)",
  properties: {
    name: deviceProperties.name,
    areaCode: deviceProperties.areaCode,
    pressureMax: deviceProperties.pressureMax,
    pressureMin: deviceProperties.pressureMin,
    lat: deviceProperties.lat,
    lon: deviceProperties.lon,
    meterCode: deviceProperties.meterCode,
    meterTypeName: deviceProperties.meterTypeName,
    meterSizeCode: deviceProperties.meterSizeCode,
    deviceType: deviceProperties.deviceType,
    productionYear: deviceProperties.productionYear,
    usageYear: deviceProperties.usageYear,
  },
} as const;

export function getReadingsListSchema(maxLimit: number) {
  return {
    tags: ["Readings"],
    summary: "Lấy dữ liệu đo theo thiết bị",
    description:
      `Đọc điểm đo (P, Q, H, nội dung thêm) theo thời gian cho một \`dataloggerCode\`. Lọc tùy chọn \`from\` / \`to\` (ISO-8601). ` +
      `Mặc định sắp xếp mới nhất trước (\`order=desc\`). Tối đa **${maxLimit}** điểm mỗi request.`,
    security: [{ apiKey: [] }],
    params: {
      type: "object",
      required: ["dataloggerCode"],
      properties: {
        dataloggerCode: {
          type: "string",
          description: "Mã datalogger (URL-encoded nếu có ký tự đặc biệt)",
        },
      },
    },
    querystring: {
      type: "object",
      properties: {
        from: {
          type: "string",
          format: "date-time",
          description: "Thời điểm bắt đầu (>=), ISO-8601 có timezone",
        },
        to: {
          type: "string",
          format: "date-time",
          description: "Thời điểm kết thúc (<=), ISO-8601 có timezone",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: maxLimit,
          default: 100,
          description: "Số điểm tối đa trả về",
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          default: "desc",
          description: "Thứ tự thời gian: asc = cũ → mới, desc = mới → cũ",
        },
      },
    },
    response: {
      200: {
        description: "Danh sách điểm đo",
        type: "object",
        properties: {
          dataloggerCode: { type: "string" },
          count: { type: "integer", minimum: 0 },
          readings: {
            type: "array",
            items: {
              type: "object",
              required: ["time"],
              properties: {
                time: { type: "string", format: "date-time" },
                p: nullableNumber,
                q: nullableNumber,
                h: nullableNumber,
                AdditionalDetails: nullableObject,
              },
            },
          },
        },
      },
      400: { ...errorBody, description: "Query không hợp lệ (vd. from/to sai định dạng)" },
      401: { description: "Thiếu hoặc sai X-API-Key" },
      404: {
        description: "Không có thiết bị hoặc đã xóa mềm",
        type: "object",
        properties: { error: { type: "string" } },
      },
    },
  };
}

export function postReadingsSchema(maxBatch: number) {
  return {
    tags: ["Readings"],
    summary: "Gửi dữ liệu đo (bulk)",
    description: `Gửi nhiều điểm (P, Q, H, nội dung thêm) theo thời gian. Nếu thiết bị chưa có, có thể tự tạo khi gửi kèm \`device\`. Trùng (thiết bị + thời điểm) bị bỏ qua (idempotent). Tối đa **${maxBatch}** điểm mỗi request.`,
    security: [{ apiKey: [] }],
    body: {
      type: "object",
      required: ["dataloggerCode", "readings"],
      properties: {
        dataloggerCode: {
          type: "string",
          minLength: 1,
          description: "Mã datalogger",
        },
        device: devicePatchIngest,
        readings: {
          type: "array",
          minItems: 1,
          items: readingPoint,
        },
      },
    },
    response: {
      201: {
        description: "Đã xử lý (một phần có thể trùng và không ghi thêm)",
        type: "object",
        properties: {
          dataloggerCode: { type: "string" },
          deviceId: { type: "string", format: "uuid" },
          inserted: { type: "integer", minimum: 0, description: "Số dòng ghi mới" },
          received: { type: "integer", minimum: 1, description: "Số điểm trong request" },
        },
      },
      400: { ...errorBody, description: "Validation / định dạng thời gian / vượt batch" },
      401: { description: "Thiếu hoặc sai X-API-Key" },
    },
  };
}

export function getRealtimeReadingsStreamSchema(backfillLimit: number) {
  return {
    tags: ["Realtime"],
    summary: "Stream dữ liệu đo realtime theo datalogger",
    description:
      "Mở kết nối SSE để nhận sự kiện `reading.created` ngay khi server ingest thành công. " +
      "Khi reconnect có thể truyền `lastEventTime` để server gửi `reading.backfill` trước khi vào luồng realtime.",
    security: [{ apiKey: [] }],
    querystring: {
      type: "object",
      required: ["dataloggerCode"],
      properties: {
        dataloggerCode: {
          type: "string",
          minLength: 1,
          description: "Mã datalogger cần subscribe",
        },
        lastEventTime: {
          type: "string",
          format: "date-time",
          description: "Mốc thời gian event cuối đã xử lý (để backfill khi reconnect)",
        },
        backfillLimit: {
          type: "integer",
          minimum: 1,
          maximum: backfillLimit,
          default: backfillLimit,
          description: "Số reading tối đa trả về trong event `reading.backfill`",
        },
      },
    },
    produces: ["text/event-stream"],
    response: {
      200: {
        description: "Luồng SSE (event-stream)",
        content: {
          "text/event-stream": {
            schema: { type: "string" },
          },
        },
      },
      400: { ...errorBody, description: "Query không hợp lệ" },
      401: { description: "Thiếu hoặc sai X-API-Key" },
      503: { ...errorBody, description: "Realtime đang tắt trên server" },
    },
  };
}

export const getRealtimeSummaryStreamSchema = {
  tags: ["Realtime"],
  summary: "Stream tong quan realtime cho dashboard",
  description:
    "Mở 1 kết nối SSE duy nhất để nhận sự kiện `reading.summary` cho mọi thiết bị có dữ liệu mới. " +
    "Phù hợp màn hình danh sách/map nhiều thiết bị.",
  security: [{ apiKey: [] }],
  produces: ["text/event-stream"],
  response: {
    200: {
      description: "Luồng SSE (event-stream) tổng quan",
      content: {
        "text/event-stream": {
          schema: { type: "string" },
        },
      },
    },
    401: { description: "Thiếu hoặc sai X-API-Key" },
    503: { ...errorBody, description: "Realtime đang tắt trên server" },
  },
} as const;

const pushAllFailureItem = {
  type: "object",
  properties: {
    dataloggerCode: { type: "string" },
    detail: { type: "string" },
  },
} as const;

export const postPushAllToIcleverSchema = {
  tags: ["Sync"],
  summary: "Đẩy toàn bộ dữ liệu local sang IOC (iclever.vn)",
  description:
    "Đọc mọi thiết bị chưa xóa mềm và toàn bộ điểm đo trong DB, gửi tuần tự lên **https://datalogger-webhook.iclever.vn** " +
    "(POST/PATCH thiết bị, bulk readings tối đa 500 điểm mỗi lần theo tài liệu IOC). " +
    "Cần **FALLBACK_API_KEY** trên server (X-API-Key hợp lệ trên host đích). Request có thể chạy lâu nếu dữ liệu lớn.",
  security: [{ apiKey: [] }],
  response: {
    200: {
      description: "Đã hoàn tất một vòng đẩy (một số thiết bị/batch có thể báo lỗi trong mảng failed)",
      type: "object",
      properties: {
        targetUrl: { type: "string", format: "uri" },
        devicesAttempted: { type: "integer", minimum: 0 },
        devicesSyncedOk: { type: "integer", minimum: 0 },
        devicesFailed: { type: "array", items: pushAllFailureItem },
        readingsBatches: { type: "integer", minimum: 0 },
        readingsPoints: { type: "integer", minimum: 0 },
        readingsFailed: { type: "array", items: pushAllFailureItem },
      },
    },
    400: {
      ...errorBody,
      description: "Chưa cấu hình FALLBACK_API_KEY",
    },
    401: { description: "Thiếu hoặc sai X-API-Key (request vào API này)" },
  },
} as const;
