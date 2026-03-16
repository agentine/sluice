-- Initialize limiter state in Redis
-- KEYS[1] = settings key
-- ARGV[1] = JSON settings
-- ARGV[2] = instance id
-- ARGV[3] = expiration (TTL in ms)

local settings_key = KEYS[1]
local settings = ARGV[1]
local instance_id = ARGV[2]
local expiration = tonumber(ARGV[3])

redis.call('SET', settings_key, settings)
if expiration and expiration > 0 then
  redis.call('PEXPIRE', settings_key, expiration)
end

-- Register this instance in the heartbeat set
local heartbeat_key = settings_key .. ':heartbeat'
redis.call('ZADD', heartbeat_key, redis.call('TIME')[1], instance_id)
if expiration and expiration > 0 then
  redis.call('PEXPIRE', heartbeat_key, expiration)
end

return 1
