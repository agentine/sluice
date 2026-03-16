-- Check if a job can run (atomic concurrency + reservoir check)
-- KEYS[1] = settings key
-- KEYS[2] = running key
-- KEYS[3] = reservoir key
-- ARGV[1] = weight
-- ARGV[2] = maxConcurrent (or -1 for unlimited)
-- ARGV[3] = now (timestamp ms)
-- ARGV[4] = minTime
-- ARGV[5] = last_scheduled key

local settings_key = KEYS[1]
local running_key = KEYS[2]
local reservoir_key = KEYS[3]
local weight = tonumber(ARGV[1])
local max_concurrent = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local min_time = tonumber(ARGV[4])
local last_key = ARGV[5]

-- Check concurrency
if max_concurrent >= 0 then
  local running = tonumber(redis.call('GET', running_key) or '0')
  if running >= max_concurrent then
    return {0, 0} -- cannot run, no wait
  end
end

-- Check minTime
if min_time > 0 then
  local last = tonumber(redis.call('GET', last_key) or '0')
  if now < last + min_time then
    return {0, (last + min_time) - now} -- cannot run, wait this many ms
  end
end

-- Check reservoir
local reservoir = redis.call('GET', reservoir_key)
if reservoir ~= false then
  reservoir = tonumber(reservoir)
  if reservoir < weight then
    return {0, 0} -- depleted
  end
  redis.call('DECRBY', reservoir_key, weight)
end

-- Increment running count
redis.call('INCRBY', running_key, 1)

-- Update last scheduled time
redis.call('SET', last_key, tostring(now))

return {1, 0} -- can run
