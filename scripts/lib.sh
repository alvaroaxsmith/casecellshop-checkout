#!/usr/bin/env bash
# Helpers compartilhados pelos scripts em scripts/ — pensado para ser lido
# (`source scripts/lib.sh`), não executado diretamente.

BASE_URL="${BASE_URL:-http://localhost:3001}"

RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
BLUE=$'\033[34m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

header() {
  echo ""
  echo "${BOLD}${BLUE}== $1 ==${RESET}"
}

info() { echo "${BLUE}i${RESET}  $1"; }
ok()   { echo "${GREEN}✓${RESET}  $1"; }
warn() { echo "${YELLOW}!${RESET}  $1"; }
fail() { echo "${RED}✗${RESET}  $1"; }

# Espera um endpoint HTTP responder 2xx, com timeout. Uso:
#   wait_for_http "http://localhost:3001/products" "backend"
wait_for_http() {
  local url="$1"
  local label="${2:-$url}"
  local attempts="${3:-40}"
  for _ in $(seq 1 "$attempts"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  fail "$label não respondeu em ${url} a tempo — rode \"npm run dev\" na raiz do repositório antes de usar este script."
  return 1
}

# Imprime uma resposta HTTP de forma legível (corpo formatado + status).
# Uso: print_response "$body" "$status"
print_response() {
  local body="$1"
  local status="$2"
  if command -v python3 >/dev/null 2>&1; then
    echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
  else
    echo "$body"
  fi
  echo "${BOLD}HTTP ${status}${RESET}"
}

# curl que já separa corpo e status em duas variáveis globais: RESP_BODY / RESP_STATUS
do_curl() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local extra_header="${4:-}"
  local raw
  if [ -n "$data" ]; then
    raw=$(curl -s -w '\n%{http_code}' -X "$method" "${BASE_URL}${path}" \
      -H "Content-Type: application/json" ${extra_header:+-H "$extra_header"} -d "$data")
  else
    raw=$(curl -s -w '\n%{http_code}' -X "$method" "${BASE_URL}${path}" ${extra_header:+-H "$extra_header"})
  fi
  RESP_STATUS=$(echo "$raw" | tail -n1)
  RESP_BODY=$(echo "$raw" | sed '$d')
}

json_field() {
  python3 -c "import sys,json; print(json.loads(sys.argv[1]).get(sys.argv[2], ''))" "$1" "$2" 2>/dev/null
}

unique_key() {
  echo "manual-$(date +%s)-$RANDOM"
}
