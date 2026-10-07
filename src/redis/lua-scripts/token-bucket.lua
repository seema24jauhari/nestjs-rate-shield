local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])   -- tokens per second
local now = tonumber(ARGV[3])          -- milliseconds
local requested = tonumber(ARGV[4]) or 1   -- optional 4th argument, defaults to 1

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
local resetAfter
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
  resetAfter = math.ceil((capacity - tokens) / refillRate)   -- time until the bucket is full
else
  resetAfter = math.ceil((requested - tokens) / refillRate)  -- time until enough tokens exist
end

redis.call("HSET", key, "tokens", tokens, "last", now)
redis.call("EXPIRE", key, math.ceil(capacity / refillRate) + 1)

return {allowed, math.floor(tokens), resetAfter}