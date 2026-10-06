local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])   -- tokens per second
local now = tonumber(ARGV[3])          -- milliseconds


local data = redis.call("HMGET", key, "tokens", "last")
local tokens = tonumber(data[1])
local last = tonumber(data[2])

if tokens == nil or last == nil then   -- new user: start with a full bucket
  tokens = capacity
  last = now
end

local elapsed = math.max(0, now - last) / 1000
tokens = math.min(capacity, tokens + elapsed * refillRate)


local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call("HSET", key, "tokens", tokens, "last", now)
redis.call("EXPIRE", key, math.ceil(capacity / refillRate) + 1)
return allowed