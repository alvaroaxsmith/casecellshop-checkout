#!/usr/bin/env bash
# Cenários de teste manual do checkout, prontos pra rodar contra os serviços
# já de pé (ex. "npm run dev" na raiz, numa aba separada). Este script só
# dispara curl — não sobe nem derruba nenhum processo.
#
# Uso: scripts/scenarios.sh <comando>
#   products            lista o catálogo com o estoque disponível de cada produto
#   happy               checkout de 1 unidade, com polling até "confirmed"
#   out-of-stock        pede mais unidades do que há em estoque
#   concurrency         dispara N requisições concorrentes pela última unidade
#   idempotency         reenvia a mesma Idempotency-Key duas vezes (no body)
#   idempotency-header  igual, mas mandando a chave no header Idempotency-Key
#   validation          payloads inválidos (sem productId, quantity fracionária, quantity zero)
#   not-found           checkout para um productId que não existe
#   order-not-found     consulta um orderId que não existe
#   erp-failure         roda um checkout e reporta o desfecho real do ERP
#   erp-random          3 checkouts em sequência, mostrando a instabilidade do modo random ao vivo
#   erp-slow            checkout contra um backend em ERP_SIM_MODE=always-timeout (processamento lento de verdade)
#   status <id>         consulta um pedido específico
#   all                  roda os cenários acima (exceto erp-slow) em sequência
#
#   só nesta branch (redis):
#   keys                 inspeciona as chaves no redis-cli
#   restart before/after  confirma que pedido e estoque sobrevivem a um restart
#   ttl                   demo isolada do TTL nativo de uma reserva

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source scripts/lib.sh

cmd_products() {
  header "GET /products"
  do_curl GET /products
  print_response "$RESP_BODY" "$RESP_STATUS"
}

# Devolve o estoque disponível de um produto (só o número, pra outros
# cenários usarem em contas).
available_stock() {
  local product_id="$1"
  do_curl GET /products
  python3 -c "
import sys, json
data = json.loads(sys.argv[1])
for p in data['products']:
    if p['id'] == sys.argv[2]:
        print(p['stock'])
        break
" "$RESP_BODY" "$product_id"
}

cmd_happy() {
  header "Caminho feliz — checkout de 1 unidade de capinha-preta"
  local key
  key=$(unique_key)
  do_curl POST /checkout '{"productId":"capinha-preta","quantity":1,"idempotencyKey":"'"$key"'"}'
  print_response "$RESP_BODY" "$RESP_STATUS"
  if [ "$RESP_STATUS" != "202" ]; then
    fail "esperava 202, recebi $RESP_STATUS — pare e olhe o log do backend"
    return 1
  fi
  local order_id
  order_id=$(json_field "$RESP_BODY" "orderId")
  info "aguardando o backend liquidar com o ERP (até ~17s no pior caso: 3 tentativas de até 3s + backoffs de 1s/2s)..."
  for _ in $(seq 1 34); do
    do_curl GET "/orders/${order_id}"
    local status
    status=$(json_field "$RESP_BODY" "status")
    if [ "$status" != "pending" ]; then
      echo ""
      print_response "$RESP_BODY" "$RESP_STATUS"
      if [ "$status" = "confirmed" ]; then
        ok "pedido $order_id confirmado"
      else
        warn "pedido $order_id terminou como '$status' (ERP em modo random pode falhar — rode de novo, ou suba o backend com ERP_SIM_MODE=always-success para um resultado garantido)"
      fi
      return 0
    fi
    sleep 0.5
  done
  warn "pedido $order_id ainda pending depois de 17s — confira o backend"
}

cmd_out_of_stock() {
  header "Estoque insuficiente — capinha-listrada"
  local stock
  stock=$(available_stock capinha-listrada)
  local ask=$((stock + 1))
  info "estoque disponível agora: ${stock} — pedindo ${ask}"
  do_curl POST /checkout '{"productId":"capinha-listrada","quantity":'"$ask"',"idempotencyKey":"'"$(unique_key)"'"}'
  print_response "$RESP_BODY" "$RESP_STATUS"
  if [ "$RESP_STATUS" = "409" ]; then
    ok "rejeitado com 409 OUT_OF_STOCK, como esperado"
  else
    fail "esperava 409, recebi $RESP_STATUS"
  fi
}

cmd_concurrency() {
  header "Concorrência — disputando a última unidade de capinha-listrada"
  local stock
  stock=$(available_stock capinha-listrada)
  local n=$((stock + 1))
  if [ "$n" -lt 2 ]; then n=2; fi
  info "estoque disponível agora: ${stock} — disparando ${n} requisições simultâneas"

  local tmpdir
  tmpdir=$(mktemp -d)
  for i in $(seq 1 "$n"); do
    (
      raw=$(curl -s -w '\n%{http_code}' -X POST "${BASE_URL}/checkout" \
        -H "Content-Type: application/json" \
        -d '{"productId":"capinha-listrada","quantity":1,"idempotencyKey":"'"$(unique_key)-$i"'"}')
      echo "$raw" | tail -n1 > "${tmpdir}/${i}.status"
    ) &
  done
  wait

  local success=0 rejected=0
  for f in "${tmpdir}"/*.status; do
    local s
    s=$(cat "$f")
    if [ "$s" = "202" ]; then success=$((success + 1)); else rejected=$((rejected + 1)); fi
  done
  rm -rf "$tmpdir"

  echo "202 (aceitos): ${success}   409 (recusados): ${rejected}"
  if [ "$success" -le "$stock" ] && [ "$success" -ge 0 ]; then
    ok "número de reservas aceitas (${success}) não passou do estoque disponível (${stock})"
  else
    fail "vendeu mais do que o estoque disponível — isso seria um bug real"
  fi
}

cmd_idempotency() {
  header "Idempotência — mesma Idempotency-Key duas vezes"
  local key
  key=$(unique_key)
  do_curl POST /checkout '{"productId":"capinha-transparente","quantity":1,"idempotencyKey":"'"$key"'"}'
  local first_order
  first_order=$(json_field "$RESP_BODY" "orderId")
  info "1ª chamada -> orderId=${first_order} status=${RESP_STATUS}"

  do_curl POST /checkout '{"productId":"capinha-transparente","quantity":1,"idempotencyKey":"'"$key"'"}'
  local second_order
  second_order=$(json_field "$RESP_BODY" "orderId")
  info "2ª chamada -> orderId=${second_order} status=${RESP_STATUS}"

  if [ "$first_order" = "$second_order" ] && [ -n "$first_order" ]; then
    ok "mesmo orderId nas duas chamadas — nenhum pedido duplicado"
  else
    fail "orderId diferente entre as duas chamadas — algo está errado"
  fi
}

cmd_validation() {
  header "Validação de entrada — payloads inválidos"

  info "sem productId"
  do_curl POST /checkout '{"quantity":1,"idempotencyKey":"'"$(unique_key)"'"}'
  print_response "$RESP_BODY" "$RESP_STATUS"
  if [ "$RESP_STATUS" = "400" ]; then ok "rejeitado com 400 VALIDATION_ERROR"; else fail "esperava 400, recebi $RESP_STATUS"; fi

  info "quantity não-inteira (1.5)"
  do_curl POST /checkout '{"productId":"capinha-preta","quantity":1.5,"idempotencyKey":"'"$(unique_key)"'"}'
  print_response "$RESP_BODY" "$RESP_STATUS"
  if [ "$RESP_STATUS" = "400" ]; then ok "rejeitado com 400 VALIDATION_ERROR"; else fail "esperava 400, recebi $RESP_STATUS"; fi

  info "quantity zero"
  do_curl POST /checkout '{"productId":"capinha-preta","quantity":0,"idempotencyKey":"'"$(unique_key)"'"}'
  print_response "$RESP_BODY" "$RESP_STATUS"
  if [ "$RESP_STATUS" = "400" ]; then ok "rejeitado com 400 VALIDATION_ERROR"; else fail "esperava 400, recebi $RESP_STATUS"; fi
}

cmd_not_found() {
  header "Produto inexistente"
  do_curl POST /checkout '{"productId":"produto-que-nao-existe","quantity":1,"idempotencyKey":"'"$(unique_key)"'"}'
  print_response "$RESP_BODY" "$RESP_STATUS"
  if [ "$RESP_STATUS" = "404" ]; then
    ok "rejeitado com 404 PRODUCT_NOT_FOUND, como esperado"
  else
    fail "esperava 404, recebi $RESP_STATUS"
  fi
}

cmd_order_not_found() {
  header "Pedido inexistente"
  do_curl GET "/orders/id-que-nao-existe"
  print_response "$RESP_BODY" "$RESP_STATUS"
  if [ "$RESP_STATUS" = "404" ]; then
    ok "rejeitado com 404 ORDER_NOT_FOUND, como esperado"
  else
    fail "esperava 404, recebi $RESP_STATUS"
  fi
}

cmd_idempotency_header() {
  header "Idempotência via header Idempotency-Key (em vez do body)"
  local key
  key=$(unique_key)
  do_curl POST /checkout '{"productId":"capinha-transparente","quantity":1}' "Idempotency-Key: ${key}"
  local first_order
  first_order=$(json_field "$RESP_BODY" "orderId")
  info "1ª chamada -> orderId=${first_order} status=${RESP_STATUS}"

  do_curl POST /checkout '{"productId":"capinha-transparente","quantity":1}' "Idempotency-Key: ${key}"
  local second_order
  second_order=$(json_field "$RESP_BODY" "orderId")
  info "2ª chamada -> orderId=${second_order} status=${RESP_STATUS}"

  if [ "$first_order" = "$second_order" ] && [ -n "$first_order" ]; then
    ok "mesmo orderId nas duas chamadas, mesmo mandando a chave só no header — nenhum pedido duplicado"
  else
    fail "orderId diferente entre as duas chamadas — algo está errado"
  fi
}

cmd_erp_failure() {
  header "Falha do ERP"
  warn "resultado depende de como o backend foi iniciado: com \"ERP_SIM_MODE=always-fail npm run dev\" o resultado abaixo é garantido; com o \"npm run dev\" padrão (modo random), pode confirmar em vez de falhar."
  local key
  key=$(unique_key)
  do_curl POST /checkout '{"productId":"capinha-transparente","quantity":1,"idempotencyKey":"'"$key"'"}'
  local order_id
  order_id=$(json_field "$RESP_BODY" "orderId")
  info "pedido criado: ${order_id} — aguardando o backend esgotar as tentativas (até ~17s no pior caso)..."
  for _ in $(seq 1 34); do
    do_curl GET "/orders/${order_id}"
    local status
    status=$(json_field "$RESP_BODY" "status")
    if [ "$status" != "pending" ]; then
      print_response "$RESP_BODY" "$RESP_STATUS"
      if [ "$status" = "failed" ]; then
        ok "pedido terminou failed (ERP_PROCESSING_FAILED esperado) — confira que o estoque foi liberado com: scripts/scenarios.sh products"
      else
        info "pedido terminou '$status' — o ERP respondeu com sucesso desta vez"
      fi
      return 0
    fi
    sleep 0.5
  done
  warn "pedido ${order_id} ainda pending depois de 17s"
}

cmd_erp_random() {
  header "ERP em modo random — lentidão/instabilidade ao vivo, sem reiniciar nada"
  info "3 checkouts em sequência contra o modo default (random: delay 500-4000ms, ~80% sucesso) — repare status e duração variando de tentativa pra tentativa"
  local i
  for i in 1 2 3; do
    local key order_id start
    key=$(unique_key)
    do_curl POST /checkout '{"productId":"capinha-transparente","quantity":1,"idempotencyKey":"'"$key"'"}'
    order_id=$(json_field "$RESP_BODY" "orderId")
    if [ "$RESP_STATUS" != "202" ]; then
      warn "tentativa ${i}: sem estoque suficiente para continuar (HTTP ${RESP_STATUS}) — rode de novo depois"
      break
    fi
    start=$(date +%s)
    local j
    for j in $(seq 1 34); do
      do_curl GET "/orders/${order_id}"
      local status
      status=$(json_field "$RESP_BODY" "status")
      if [ "$status" != "pending" ]; then
        echo "  tentativa ${i}: orderId=${order_id} status=${status} duração≈$(( $(date +%s) - start ))s"
        break
      fi
      sleep 0.5
    done
  done
  ok "repare como o desfecho e a duração mudam de tentativa pra tentativa — essa variação É a simulação de lentidão/instabilidade do ERP no modo default"
}

cmd_erp_slow() {
  header "ERP sempre lento — modo always-timeout (processamento lento de verdade)"
  warn "só é determinístico se o backend tiver sido iniciado com \"ERP_SIM_MODE=always-timeout npm run start:dev\" (dentro de backend/) — com o padrão random, pode confirmar rápido em vez de estourar o timeout."
  local key order_id
  key=$(unique_key)
  do_curl POST /checkout '{"productId":"capinha-preta","quantity":1,"idempotencyKey":"'"$key"'"}'
  print_response "$RESP_BODY" "$RESP_STATUS"
  order_id=$(json_field "$RESP_BODY" "orderId")
  info "pedido ${order_id} criado — cada uma das 3 tentativas a seguir é uma chamada HTTP real ao erp-mock perdendo a corrida contra o timeout de 3s do backend (Promise.race), não um erro simulado em memória"
  info "acompanhe em paralelo o log do backend: procure por \"attempt=\", \"durationMs=\" (~3000) e \"backoffMs=\""
  local _
  for _ in $(seq 1 34); do
    do_curl GET "/orders/${order_id}"
    local status
    status=$(json_field "$RESP_BODY" "status")
    if [ "$status" != "pending" ]; then
      echo ""
      print_response "$RESP_BODY" "$RESP_STATUS"
      if [ "$status" = "failed" ]; then
        ok "pedido terminou failed/ERP_PROCESSING_FAILED após esgotar as 3 tentativas — a simulação de processamento lento do ERP está funcionando"
      else
        warn "pedido terminou '$status' — confira se o backend está mesmo rodando com ERP_SIM_MODE=always-timeout"
      fi
      return 0
    fi
    sleep 0.5
  done
  warn "pedido ${order_id} ainda pending depois de 17s — confira o backend"
}

cmd_keys() {
  header "Chaves no Redis (redis-cli, sem passar pela API)"
  info "order:*"
  redis-cli keys 'order:*'
  info "product:stock:*"
  for p in capinha-preta capinha-transparente capinha-listrada; do
    echo "  product:stock:${p} = $(redis-cli get "product:stock:${p}")"
  done
  info "reservation:* (ativas agora — reservas confirmadas/liberadas não aparecem aqui)"
  redis-cli keys 'reservation:*'
}

cmd_restart() {
  local phase="${1:-}"
  case "$phase" in
    before)
      header "Restart (antes) — cria um pedido pra comparar depois"
      local key
      key=$(unique_key)
      do_curl POST /checkout '{"productId":"capinha-preta","quantity":1,"idempotencyKey":"'"$key"'"}'
      local order_id
      order_id=$(json_field "$RESP_BODY" "orderId")
      print_response "$RESP_BODY" "$RESP_STATUS"
      info "aguardando confirmar..."
      sleep 3
      do_curl GET "/orders/${order_id}"
      print_response "$RESP_BODY" "$RESP_STATUS"
      echo ""
      warn "agora reinicie o backend manualmente (Ctrl+C no terminal do \"npm run dev\" e rode de novo), e então rode:"
      echo "  scripts/scenarios.sh restart after ${order_id}"
      ;;
    after)
      local order_id="${2:-}"
      if [ -z "$order_id" ]; then
        fail "uso: scripts/scenarios.sh restart after <orderId>"
        return 1
      fi
      header "Restart (depois) — confirmando que o pedido sobreviveu"
      do_curl GET "/orders/${order_id}"
      print_response "$RESP_BODY" "$RESP_STATUS"
      if [ "$(json_field "$RESP_BODY" "status")" = "confirmed" ]; then
        ok "pedido ${order_id} continua confirmed depois do restart — não seria assim em main"
      else
        warn "status inesperado — confira manualmente"
      fi
      cmd_products
      ;;
    *)
      fail "uso: scripts/scenarios.sh restart before   |   scripts/scenarios.sh restart after <orderId>"
      return 1
      ;;
  esac
}

cmd_ttl() {
  header "TTL nativo do Redis liberando uma reserva sozinho (demo isolada, 3s)"
  info "a reserva real usa TTL de 120s (longo demais pra caber numa demo) — isso aqui só mostra o mecanismo"
  redis-cli set reservation:demo-ttl "capinha-preta:1" EX 3 >/dev/null
  echo "TTL logo após criar: $(redis-cli ttl reservation:demo-ttl)"
  info "aguardando 4s..."
  sleep 4
  local exists
  exists=$(redis-cli exists reservation:demo-ttl)
  echo "EXISTS depois de 4s (TTL era 3s): ${exists}"
  if [ "$exists" = "0" ]; then
    ok "a chave sumiu sozinha — nenhum código da aplicação rodou entre as duas linhas acima"
  else
    fail "a chave ainda existe — algo não bateu"
  fi
}

cmd_status() {
  local order_id="${1:-}"
  if [ -z "$order_id" ]; then
    fail "uso: scripts/scenarios.sh status <orderId>"
    return 1
  fi
  header "GET /orders/${order_id}"
  do_curl GET "/orders/${order_id}"
  print_response "$RESP_BODY" "$RESP_STATUS"
}

cmd_all() {
  cmd_products
  cmd_happy
  cmd_out_of_stock
  cmd_concurrency
  cmd_idempotency
  cmd_idempotency_header
  cmd_validation
  cmd_not_found
  cmd_order_not_found
  cmd_erp_failure
  cmd_erp_random
  header "Fim"
  ok "todos os cenários rodaram — reveja os resultados acima (erp-slow fica de fora: exige reiniciar o backend com ERP_SIM_MODE=always-timeout, veja o README)"
}

main() {
  wait_for_http "${BASE_URL}/products" "backend" 4 || exit 1

  case "${1:-}" in
    products) cmd_products ;;
    happy) cmd_happy ;;
    out-of-stock) cmd_out_of_stock ;;
    concurrency) cmd_concurrency ;;
    idempotency) cmd_idempotency ;;
    idempotency-header) cmd_idempotency_header ;;
    validation) cmd_validation ;;
    not-found) cmd_not_found ;;
    order-not-found) cmd_order_not_found ;;
    erp-failure) cmd_erp_failure ;;
    erp-random) cmd_erp_random ;;
    erp-slow) cmd_erp_slow ;;
    status) cmd_status "${2:-}" ;;
    keys) cmd_keys ;;
    restart) cmd_restart "${2:-}" "${3:-}" ;;
    ttl) cmd_ttl ;;
    all) cmd_all ;;
    *)
      echo "Uso: scripts/scenarios.sh <comando>"
      echo ""
      echo "  products            lista o catálogo com o estoque disponível"
      echo "  happy               checkout de 1 unidade, com polling até confirmed"
      echo "  out-of-stock        pede mais unidades do que há em estoque"
      echo "  concurrency         dispara N requisições concorrentes pela última unidade"
      echo "  idempotency         reenvia a mesma Idempotency-Key duas vezes (no body)"
      echo "  idempotency-header  igual, mas mandando a chave no header Idempotency-Key"
      echo "  validation          payloads inválidos (sem productId, quantity fracionária, quantity zero)"
      echo "  not-found           checkout para um productId que não existe"
      echo "  order-not-found     consulta um orderId que não existe"
      echo "  erp-failure         roda um checkout e reporta o desfecho real"
      echo "  erp-random          3 checkouts em sequência, mostrando a instabilidade do modo random ao vivo"
      echo "  erp-slow            checkout contra um backend em ERP_SIM_MODE=always-timeout (processamento lento de verdade)"
      echo "  status <id>         consulta um pedido específico"
      echo "  all                 roda todos os cenários acima (exceto erp-slow) em sequência"
      echo ""
      echo "  só nesta branch (redis):"
      echo "  keys                 inspeciona as chaves order:*/product:stock:*/reservation:* direto no redis-cli"
      echo "  restart before       cria um pedido e pede pra você reiniciar o backend manualmente"
      echo "  restart after <id>   confirma que o pedido sobreviveu ao restart"
      echo "  ttl                  demo isolada do TTL nativo liberando uma reserva sozinho"
      exit 1
      ;;
  esac
}

main "$@"
