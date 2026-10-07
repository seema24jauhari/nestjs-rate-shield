local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

-- drop requests older than the window
redis.call("ZREMRANGEBYSCORE", key, 0, now - window * 1000)
local count = redis.call("ZCARD", key)

local allowed = 0
local remaining = 0

if count < limit then
  redis.call("ZADD", key, now, member)
  redis.call("EXPIRE", key, window)
  allowed = 1
  remaining = limit - count - 1
end

-- seconds until the oldest request leaves the window (a slot frees up)
local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
local resetAfter = window
if oldest[2] then
  resetAfter = math.ceil((tonumber(oldest[2]) + window * 1000 - now) / 1000)
end
if resetAfter < 1 then
  resetAfter = 1
end

return {allowed, remaining, resetAfter}