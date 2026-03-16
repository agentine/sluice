// Lua script definitions — embedded as strings to avoid fs reads at runtime
// These match the .lua files in src/redis/lua/ for reference

export const LUA_SCRIPTS = {
  init: {
    script: `
local settings_key = KEYS[1]
local settings = ARGV[1]
local instance_id = ARGV[2]
local expiration = tonumber(ARGV[3])
redis.call('SET', settings_key, settings)
if expiration and expiration > 0 then
  redis.call('PEXPIRE', settings_key, expiration)
end
local heartbeat_key = settings_key .. ':heartbeat'
redis.call('ZADD', heartbeat_key, redis.call('TIME')[1], instance_id)
if expiration and expiration > 0 then
  redis.call('PEXPIRE', heartbeat_key, expiration)
end
return 1`,
    keys: 1,
  },

  check: {
    script: `
local running_key = KEYS[1]
local reservoir_key = KEYS[2]
local last_key = KEYS[3]
local weight = tonumber(ARGV[1])
local max_concurrent = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local min_time = tonumber(ARGV[4])
if max_concurrent >= 0 then
  local running = tonumber(redis.call('GET', running_key) or '0')
  if running >= max_concurrent then
    return {0, 0}
  end
end
if min_time > 0 then
  local last = tonumber(redis.call('GET', last_key) or '0')
  if now < last + min_time then
    return {0, (last + min_time) - now}
  end
end
local reservoir = redis.call('GET', reservoir_key)
if reservoir ~= false then
  reservoir = tonumber(reservoir)
  if reservoir < weight then
    return {0, 0}
  end
  redis.call('DECRBY', reservoir_key, weight)
end
redis.call('INCRBY', running_key, 1)
redis.call('SET', last_key, tostring(now))
return {1, 0}`,
    keys: 3,
  },

  done: {
    script: `
local running_key = KEYS[1]
local n = tonumber(ARGV[1]) or 1
local running = tonumber(redis.call('GET', running_key) or '0')
running = math.max(0, running - n)
redis.call('SET', running_key, tostring(running))
return running`,
    keys: 1,
  },

  heartbeat: {
    script: `
local heartbeat_key = KEYS[1]
local instance_id = ARGV[1]
local now = tonumber(ARGV[2])
local timeout = tonumber(ARGV[3])
redis.call('ZADD', heartbeat_key, now, instance_id)
local dead_threshold = now - timeout
local dead = redis.call('ZRANGEBYSCORE', heartbeat_key, '-inf', dead_threshold)
if #dead > 0 then
  redis.call('ZREMRANGEBYSCORE', heartbeat_key, '-inf', dead_threshold)
end
return dead`,
    keys: 1,
  },

  reservoir: {
    script: `
local reservoir_key = KEYS[1]
local op = ARGV[1]
if op == 'get' then
  local val = redis.call('GET', reservoir_key)
  if val == false then return -1 end
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
  if maximum and current > maximum then current = maximum end
  redis.call('SET', reservoir_key, tostring(current))
  return current
end
return -1`,
    keys: 1,
  },
} as const;

export type ScriptName = keyof typeof LUA_SCRIPTS;
