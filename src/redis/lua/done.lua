-- Mark a job as done (decrement running count)
-- KEYS[1] = running key
-- ARGV[1] = n (number of jobs completed, default 1)

local running_key = KEYS[1]
local n = tonumber(ARGV[1]) or 1

local running = tonumber(redis.call('GET', running_key) or '0')
running = math.max(0, running - n)
redis.call('SET', running_key, tostring(running))

return running
