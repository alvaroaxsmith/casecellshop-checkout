-- Confirma uma reserva ativa: debita o estoque base permanentemente e
-- remove a reserva. Idempotente por natureza — se a chave já não existir
-- (já confirmada, já liberada, ou expirada sozinha por TTL), é um no-op,
-- espelhando a proteção "does not double-deduct stock" que já existe na
-- versão em memória.
--
-- KEYS[1] = reservation:{orderId}
-- ARGV[1] = orderId
--
-- Retorno: 1 se confirmou e debitou; 0 se não havia reserva ativa.

local val = redis.call('GET', KEYS[1])
if val == false then
  return 0
end

local productId, quantity = string.match(val, '([^:]+):(%d+)')
quantity = tonumber(quantity)

redis.call('DECRBY', 'product:stock:' .. productId, quantity)
redis.call('HDEL', 'product:reservations:' .. productId, ARGV[1])
redis.call('DEL', KEYS[1])

return 1
