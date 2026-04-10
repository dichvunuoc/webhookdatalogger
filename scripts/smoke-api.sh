#!/usr/bin/env bash
# Smoke test API với dữ liệu mẫu thực tế (QY23-D315 / BC06 / 140017).
# Yêu cầu: API đang chạy (npm run dev) và DB đã migrate.
#
#   export BASE_URL=http://localhost:3000
#   export API_KEY=dev-key-change-me
#   ./scripts/smoke-api.sh

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-dev-key-change-me}"

pass=0
fail=0

ok() { echo "[OK] $*"; pass=$((pass + 1)); }
bad() { echo "[FAIL] $*" >&2; fail=$((fail + 1)); }

echo "=== 1) GET /health (không cần API key) ==="
code=$(curl -s --connect-timeout 5 -o /tmp/wh_health.json -w "%{http_code}" "$BASE_URL/health")
if [[ "$code" == "200" ]] && grep -q '"status"' /tmp/wh_health.json; then
  ok "HTTP $code $(cat /tmp/wh_health.json)"
else
  bad "HTTP $code body=$(cat /tmp/wh_health.json 2>/dev/null || true)"
fi

echo ""
echo "=== 2) POST /api/v1/devices (đăng ký thiết bị) ==="
code=$(curl -s -o /tmp/wh_dev.json -w "%{http_code}" -X POST "$BASE_URL/api/v1/devices" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
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
  }')
if [[ "$code" == "201" ]] || [[ "$code" == "409" ]]; then
  ok "HTTP $code (201=created, 409=đã tồn tại — chấp nhận)"
  cat /tmp/wh_dev.json | head -c 400; echo
else
  bad "HTTP $code body=$(cat /tmp/wh_dev.json 2>/dev/null || echo '(no file)')"
fi

echo ""
echo "=== 3) POST /api/v1/datalogger/readings (bulk P/Q) ==="
code=$(curl -s -o /tmp/wh_read.json -w "%{http_code}" -X POST "$BASE_URL/api/v1/datalogger/readings" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "dataloggerCode": "140017",
    "device": { "areaCode": "BC06" },
    "readings": [
      { "time": "2026-04-06T11:26:31+07:00", "p": 3.71, "q": 244 },
      { "time": "06/04/2026 11:25:31", "p": 3.71, "q": 242 },
      { "time": "06/04/2026 11:24:31", "p": 3.71, "q": 244 }
    ]
  }')
if [[ "$code" == "201" ]]; then
  ok "HTTP $code"
  cat /tmp/wh_read.json
else
  bad "HTTP $code body=$(cat /tmp/wh_read.json 2>/dev/null || echo '(no file)')"
fi

echo ""
echo "=== 4) POST readings lần 2 (idempotent: inserted có thể = 0) ==="
code=$(curl -s -o /tmp/wh_read2.json -w "%{http_code}" -X POST "$BASE_URL/api/v1/datalogger/readings" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "dataloggerCode": "140017",
    "readings": [
      { "time": "2026-04-06T11:26:31+07:00", "p": 3.71, "q": 244 }
    ]
  }')
if [[ "$code" == "201" ]]; then
  ok "HTTP $code"
  cat /tmp/wh_read2.json
else
  bad "HTTP $code body=$(cat /tmp/wh_read2.json 2>/dev/null || echo '(no file)')"
fi

echo ""
echo "=== 5) PATCH thiết bị ==="
code=$(curl -s -o /tmp/wh_patch.json -w "%{http_code}" -X PATCH "$BASE_URL/api/v1/devices/140017" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{ "pressureMax": 4.0 }')
if [[ "$code" == "200" ]]; then
  ok "HTTP $code"
  grep -qE '"pressureMax":\s*4(\.0)?' /tmp/wh_patch.json && ok "pressureMax=4 trong body" || bad "body không như mong đợi: $(cat /tmp/wh_patch.json)"
else
  bad "HTTP $code body=$(cat /tmp/wh_patch.json 2>/dev/null || echo '(no file)')"
fi

echo ""
echo "=== Tổng kết ==="
echo "Passed checks: $pass, Failed: $fail"
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
