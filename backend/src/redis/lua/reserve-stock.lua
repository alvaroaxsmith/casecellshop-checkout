-- Reserva de estoque atômica (ADR-002). Roda inteira sem interrupção de
-- outro comando no mesmo Redis, o que garante a mesma operação indivisível
-- de "checar-e-reservar" que a versão em memória tinha por rodar síncrona
-- dentro do event loop do Node.
--
-- KEYS[1] = product:stock:{productId}       -- estoque base, inteiro
-- KEYS[2] = product:reservations:{productId} -- hash: orderId -> quantity
-- ARGV[1] = quantity solicitada
-- ARGV[2] = TTL da reserva em segundos
-- ARGV[3] = orderId
-- ARGV[4] = productId (só para compor a chave "reservation:<orderId>")
--
-- Retorno: -1 se o estoque base ainda não foi semeado (cache-miss não
-- tratado pela aplicação); caso contrário, o estoque disponível calculado
-- ANTES desta tentativa. O chamador compara esse valor com ARGV[1]: se
-- disponível >= quantidade, a reserva foi gravada (sucesso); senão, nada
-- foi escrito (estoque insuficiente).

local base = redis.call('GET', KEYS[1])
if base == false then
  return -1
end
base = tonumber(base)

local reserved = 0
local fields = redis.call('HKEYS', KEYS[2])
for _, orderId in ipairs(fields) do
  -- A chave individual "reservation:<orderId>" carrega o TTL nativo do
  -- Redis (ADR-002) — sua existência é a fonte da verdade de que a reserva
  -- ainda está ativa. Quando o TTL expira sozinho, ela some, e o campo
  -- correspondente aqui na hash é podado na próxima leitura.
  if redis.call('EXISTS', 'reservation:' .. orderId) == 1 then
    reserved = reserved + tonumber(redis.call('HGET', KEYS[2], orderId))
  else
    redis.call('HDEL', KEYS[2], orderId)
  end
end

local available = base - reserved
local quantity = tonumber(ARGV[1])

if available < quantity then
  return available
end

redis.call('HSET', KEYS[2], ARGV[3], ARGV[1])
redis.call('SET', 'reservation:' .. ARGV[3], ARGV[4] .. ':' .. ARGV[1], 'EX', ARGV[2])

return available
