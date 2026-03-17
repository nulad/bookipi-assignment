local stockKey = KEYS[1]
local purchasedUsersKey = KEYS[2]

local userId = ARGV[1]
local nowMs = tonumber(ARGV[2])
local saleStartMs = tonumber(ARGV[3])
local saleEndMs = tonumber(ARGV[4])

if nowMs < saleStartMs then
  return 'NOT_STARTED'
end

if nowMs > saleEndMs then
  return 'ENDED'
end

if redis.call('SISMEMBER', purchasedUsersKey, userId) == 1 then
  return 'ALREADY_PURCHASED'
end

local stockValue = redis.call('GET', stockKey)
local stock = tonumber(stockValue)

if stock == nil or stock <= 0 then
  return 'SOLD_OUT'
end

redis.call('DECR', stockKey)
redis.call('SADD', purchasedUsersKey, userId)

return 'SUCCESS'
