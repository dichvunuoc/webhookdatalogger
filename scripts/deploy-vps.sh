#!/usr/bin/env bash
# Đồng bộ mã nguồn lên VPS và build + chạy Docker Compose (production).
#
# Yêu cầu local: rsync, ssh (vd: Host k8s-longvan-ubuntu trong ~/.ssh/config)
# Yêu cầu VPS: Docker + Docker Compose plugin
#
# Lần đầu trên VPS:
#   ssh k8s-longvan-ubuntu
#   mkdir -p ~/webhookdatalogger && cd ~/webhookdatalogger
#   cp .env.production.example .env.production && nano .env.production
#
# Triển khai từ máy dev:
#   chmod +x scripts/deploy-vps.sh && ./scripts/deploy-vps.sh
#
# Tuỳ biến:
#   REMOTE_REAL=/opt/webhookdatalogger ./scripts/deploy-vps.sh
#   SSH_HOST=user@1.2.3.4 ./scripts/deploy-vps.sh

set -euo pipefail

SSH_HOST="${SSH_HOST:-k8s-longvan-ubuntu}"
if [ -n "${REMOTE_REAL:-}" ]; then
  :
else
  REMOTE_REAL=$(ssh "$SSH_HOST" 'echo $HOME/webhookdatalogger')
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Rsync → ${SSH_HOST}:${REMOTE_REAL}"
ssh "$SSH_HOST" "mkdir -p \"${REMOTE_REAL}\""

rsync -avz --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude '.env.production' \
  --exclude '.cursor' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  ./ "${SSH_HOST}:${REMOTE_REAL}/"

echo "==> Docker Compose (production) trên VPS"
ssh "$SSH_HOST" bash -lc "
set -euo pipefail
cd \"${REMOTE_REAL}\"
if [ ! -f .env.production ]; then
  echo 'Thiếu .env.production. Trên server:' >&2
  echo \"  cd ${REMOTE_REAL} && cp .env.production.example .env.production && nano .env.production\" >&2
  exit 1
fi
docker compose -f docker-compose.prod.yml --env-file .env.production build --no-cache api
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production ps
"

echo "==> Xong. API chỉ trong Docker (api:3000). Test: docker compose -f docker-compose.prod.yml --env-file .env.production exec api wget -qO- http://127.0.0.1:3000/health"
