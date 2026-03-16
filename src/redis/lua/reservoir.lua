-- Reservoir operations (get, set, increment)
-- KEYS[1] = reservoir key
-- ARGV[1] = operation ("get", "set", "incr")
-- ARGV[2] = amount (for set/incr)
-- ARGV[3] = maximum (for incr, optional)

local reservoir_key = KEYS[1]
local op = ARGV[1]

if op == 'get' then
  local val = redis.call('GET', reservoir_key)
  if val == false then
    return -1 -- null sentinel
  end
  return tonumber(val)

elseif op == 'set' then
  local amount = tonumber(ARGV[2])
  redis.call('SET', reservoir_key, tostring(amount))
  return amount

elseif op == 'incr' then
  local amount = tonumber(ARGV[2])
  local maximum = ARGV[3] and tonumber(ARGV[3])
  local current = tonumber(redis.call('GET', reservoir_key) or '0')
  current = current + amount
  if maximum and current > maximum then
    current = maximum
  end
  redis.call('SET', reservoir_key, tostring(current))
  return current
end

return -1
