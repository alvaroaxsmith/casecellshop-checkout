-- Libera uma reserva ativa sem debitar estoque (checkout falhou antes do
-- ERP confirmar). No-op se a reserva já não existir (já confirmada, já
-- liberada, ou expirada sozinha por TTL).
--
-- KEYS[1] = reservation:{orderId}
-- ARGV[1] = orderId
--
-- Retorno: 1 se liberou; 0 se não havia reserva ativa.

local val = redis.call('GET', KEYS[1])
if val == false then
  return 0
end

local productId = string.match(val, '([^:]+):')

redis.call('HDEL', 'product:reservations:' .. productId, ARGV[1])
redis.call('DEL', KEYS[1])

return 1
