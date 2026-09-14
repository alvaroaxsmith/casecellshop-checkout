#!/usr/bin/env bash
# Espera o Redis (subido por "docker compose up -d redis", no predev do
# npm run dev) responder a um PING antes de deixar o resto do "npm run dev"
# continuar — sem isso, o backend pode tentar conectar cedo demais na
# primeira subida do container.
set -uo pipefail

for _ in $(seq 1 40); do
  if redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
    echo "Redis pronto."
    exit 0
  fi
  sleep 0.25
done

echo "Redis não respondeu a tempo em 127.0.0.1:6379 — confira \"docker compose ps\" e os logs do container (\"docker compose logs redis\")." >&2
exit 1
