import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

/** Gọi trước mọi route có `schema` (để gom OpenAPI). */
export async function registerOpenApiSpec(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Webhook Datalogger API",
        description:
          "Đăng ký thiết bị đồng hồ / datalogger và gửi dữ liệu đo theo thời gian (P, Q, H, nội dung thêm). " +
          "Xác thực: header **X-API-Key** (trừ GET /health). " +
          "Tài liệu Markdown: `docs/HUONG_DAN_TICH_HOP_WEBHOOK.md`.",
        version: "1.0.0",
        contact: {
          name: "IOC / IT — Quảng Ninh",
        },
      },
      tags: [
        { name: "Health", description: "Kiểm tra dịch vụ (không cần API key)" },
        {
          name: "Devices",
          description: "Danh sách, đăng ký, cập nhật, xóa mềm thiết bị theo mã datalogger",
        },
        {
          name: "Readings",
          description: "Đọc và gửi dữ liệu đo (bulk) — API chính cho nhà máy",
        },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
            description: "API key do IOC/IT cấp cho nhà máy",
          },
        },
      },
    },
  });
}

/** Gọi sau khi đã đăng ký toàn bộ route (UI đọc spec đầy đủ). */
export async function registerOpenApiUi(app: FastifyInstance) {
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
}
