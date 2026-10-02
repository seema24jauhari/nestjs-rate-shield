local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call("ZREMRANGEBYSCORE", key, 0, now - window * 1000)
local count = redis.call("ZCARD", key)

if count < limit then
  redis.call("ZADD", key, now, member)
  redis.call("EXPIRE", key, window)
  return 1
else
  return 0
end