-- Update heartbeat and clean up dead instances
-- KEYS[1] = heartbeat key
-- ARGV[1] = instance id
-- ARGV[2] = current time (unix seconds)
-- ARGV[3] = timeout (seconds, instances older than this are dead)

local heartbeat_key = KEYS[1]
local instance_id = ARGV[1]
local now = tonumber(ARGV[2])
local timeout = tonumber(ARGV[3])

-- Update this instance's heartbeat
redis.call('ZADD', heartbeat_key, now, instance_id)

-- Find and remove dead instances
local dead_threshold = now - timeout
local dead = redis.call('ZRANGEBYSCORE', heartbeat_key, '-inf', dead_threshold)
if #dead > 0 then
  redis.call('ZREMRANGEBYSCORE', heartbeat_key, '-inf', dead_threshold)
end

return dead
