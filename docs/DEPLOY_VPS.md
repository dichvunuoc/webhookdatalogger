# Triển khai lên VPS (SSH + Docker)

Hướng dẫn đóng gói và chạy dịch vụ trên máy chỉ cần **SSH** (ví dụ alias `k8s-longvan-ubuntu` trong `~/.ssh/config`).

## Yêu cầu VPS

- Docker Engine + **Docker Compose** (plugin `docker compose`)
- User SSH có quyền chạy `docker` (thường trong group `docker`)

## Chuẩn bị một lần trên VPS

```bash
ssh k8s-longvan-ubuntu
mkdir -p ~/webhookdatalogger
cd ~/webhookdatalogger
```

Sau lần **deploy đầu tiên** (hoặc copy tay repo), tạo file bí mật:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production   # POSTGRES_PASSWORD, QUAWACO_API_KEYS (bắt buộc)
```

Không commit `.env.production` — file này đã nằm trong `.gitignore`.

## Triển khai từ máy phát triển

```bash
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
# hoặc
npm run deploy:vps
```

Mặc định:

- **SSH host:** `k8s-longvan-ubuntu` (đổi bằng biến `SSH_HOST`)
- **Thư mục trên VPS:** `~/webhookdatalogger` (đổi bằng `REMOTE_REAL`)

Ví dụ:

```bash
SSH_HOST=myuser@10.0.0.5 REMOTE_REAL=/opt/webhookdatalogger ./scripts/deploy-vps.sh
```

Script sẽ:

1. `rsync` mã nguồn (bỏ `node_modules`, `.git`, `.env`, `.env.production`…)
2. Trên VPS: `docker compose -f docker-compose.prod.yml --env-file .env.production build` và `up -d`

## File Compose production

- [`docker-compose.prod.yml`](../docker-compose.prod.yml): **không** publish cổng API hay PostgreSQL ra host — mọi thứ chỉ trong **mạng Docker** nội bộ. Container API lắng nghe cổng **3000** (tên service: `api`, URL nội bộ: `http://api:3000`).
- Biến môi trường: xem [`.env.production.example`](../.env.production.example).

## Truy cập API từ ngoài

Vì không bind host, cần một trong các cách:

1. **Reverse proxy** (Nginx, Caddy, Traefik) chạy trên cùng host, container cùng **network** với stack (hoặc `network_mode` / external network), `proxy_pass http://api:3000`.
2. **Mạng nội bộ / VPN**: client và VPS cùng LAN, vẫn cần proxy hoặc port-forward tùy kiến trúc.
3. **Kiểm tra nhanh** (từ thư mục deploy, gọi thẳng vào process trong container `api`):
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production exec api wget -qO- http://127.0.0.1:3000/health
   ```
   (Nếu image thiếu `wget`, dùng container tạm cùng network: `docker run --rm --network <tên_network_của_stack> curlimages/curl -s http://api:3000/health`.)

## Sau khi có reverse proxy

- Health: `GET /health`
- Swagger: `GET /docs`
- Base URL cho nhà máy: URL public do Nginx/TLS cấp (HTTPS khuyến nghị).

## Mật khẩu DB trong URL

Nếu `POSTGRES_PASSWORD` có ký tự đặc biệt (`@`, `:`, `%`…), cần **encode** trong `DATABASE_URL` hoặc dùng mật khẩu chỉ gồm ký tự an toàn — Compose truyền biến vào container; trường hợp phức tạp có thể chỉnh `DATABASE_URL` thủ công trong `docker-compose.prod.yml` (không khuyến nghị sửa trừ khi cần).
