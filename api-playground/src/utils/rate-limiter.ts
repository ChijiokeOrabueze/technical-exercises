import { Request, Response, NextFunction } from "express";
import { redisClient } from "./redis";

const KEY_PREFIX = "rate_limiter";
const FiXED_WINDOW_SCRIPT = `
    local key = KEYS[1]
    local window_size = tonumber(ARGV[1])

    local count = redis.call('INCR', key)

    if count == 1 then
        redis.call('EXPIRE', key, window_size)
    end

    local pttl = redis.call('PTTL', key);

    return {count, pttl}

`;

const fixedWindow = async (
  clientId: string,
  windowSize: number,
  maxRequest: number,
) => {
  const [count, pttl] = (await redisClient.eval(FiXED_WINDOW_SCRIPT, {
    keys: [`${KEY_PREFIX}:fixed_window:${clientId}`],
    arguments: [windowSize.toString()],
  })) as [number, number];

  const allowed = count <= maxRequest;

  return {
    allowed,
    remaining: Math.max(0, maxRequest - count),
    retryAfter: allowed ? 0 : pttl === 0 ? windowSize : pttl / 1000,
  };
};

const SLIDING_WINDOW_LOG_SCRIPT = `
  local key = KEYS[1]
  local window_size = tonumber(ARGV[1])
  local max_request = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])
  local member = ARGV[4]

  local window_start = now - window_size*1000

  redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

  local count = redis.call('ZCARD', key)
  local pttl = window_size * 1000

  if count < max_request then
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, window_size)
    
    return {1, max_request - count - 1, 0}
  end

  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')

  if #oldest >= 2 then
    pttl = oldest[2] + window_size*1000 - now
  end

  return {0, 0, pttl}

`;

const slidingWindowLog = async (
  clientId: string,
  windowSize: number,
  maxRequest: number,
) => {
  const now = Date.now().toString();
  const member = `${now}:${Math.random()}`;
  const key = `${KEY_PREFIX}:sliding_w_l:${clientId}`;

  const [allowed, remaining, retryAfterInMS] = (await redisClient.eval(
    SLIDING_WINDOW_LOG_SCRIPT,
    {
      keys: [key],
      arguments: [windowSize.toString(), maxRequest.toString(), now, member],
    },
  )) as [number, number, number];

  return {
    allowed: !!allowed,
    remaining,
    retryAfter: retryAfterInMS / 1000,
  };
};

const SLIDING_WINDOW_COUNTER_SCRIPT = `

  local current_key = KEYS[1]
  local prev_key = KEYS[1]

  local elapsed = tonumber(ARGV[1])
  local window_size = tonumber(ARGV[2])
  local max_request = tonumber(ARGV[3])

  local prev_count = tonumber(redis.call('GET', prev_key) or '0')
  local curr_count = tonumber(redis.call('GET', current_key) or '0')

  local weighted_prev = prev_count * (1 - elapsed)
  local estimate = curr_count + weighted_prev

  if estimate >= max_request then
    return {0, 0, estimate, curr_count}
  end

  local count = redis.call('INCR', current_key)

  if count == 1 then
    redis.call('EXPIRE', current_key, window_size * 2)
  end

  local new_estimate = count + weighted_prev
  return {1, math.max(0, math.floor(max_request - new_estimate)) }
`;

const slidingWindowCounter = async (
  clientId: string,
  windowSize: number,
  maxRequest: number,
) => {
  const fullWindow = Date.now() / (windowSize * 1000);
  const currentWindow = Math.floor(fullWindow);
  const prevWindow = currentWindow - 1;
  const elapsed = fullWindow - currentWindow;
  const baseKey = "345";

  const currentKey = `{${baseKey}}:${KEY_PREFIX}:sliding_w_l:${clientId}:${currentWindow}`;
  const prevKey = `{${baseKey}}:${KEY_PREFIX}:sliding_w_l:${clientId}:${prevWindow}`;

  const [allowed, remaining] = (await redisClient.eval(
    SLIDING_WINDOW_COUNTER_SCRIPT,
    {
      keys: [currentKey, prevKey],
      arguments: [
        elapsed.toString(),
        windowSize.toString(),
        maxRequest.toString(),
      ],
    },
  )) as [number, number, number];

  return {
    allowed: !!allowed,
    remaining,
    // retryAfter: retryAfterInMS / 1000,
  };
};

const TOKEN_BUCKET_SCRIPT = `

  local key = KEYS[1]
  local max_tokens = tonumber(ARGV[1])
  local refill_rate = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])

  local data = redis.call('HGETALL', key)
  local prev_tokens = max_tokens
  local last_refill = now

  if #data > 0 then 
    local fields = {}

    for i = 1, #data, 2 do
      fields[data[i]] = data[i+1]
    end

    prev_tokens = tonumber(fields['tokens'])
    last_refill = tonumber(fields['last_refill'])
  end

  local elapsed = now - last_refill
  local new_tokens = prev_tokens + (elapsed*refill_rate)
  local tokens = math.min(max_tokens, new_tokens)

  local allowed = 1
  local remaining = math.max(0, tokens - 1)

  if tokens < 1 then
    allowed = 0
  end

  redis.call('HSET', key, 'tokens', remaining, 'last_refill', now)
  redis.call('EXPIRE', key, math.ceil(max_tokens/refill_rate))

  return {allowed, remaining}

`;

const tokenBucket = async (
  clientId: string,
  maxTokens: number,
  refillRate: number,
) => {
  console.log({ clientId });
  const now = Date.now() / 1000;
  const [allowed, remaining] = (await redisClient.eval(TOKEN_BUCKET_SCRIPT, {
    keys: [`${KEY_PREFIX}:token_bucket:${clientId}`],
    arguments: [maxTokens.toString(), refillRate.toString(), now.toString()],
  })) as [number, number];

  const retryAfter = allowed ? 0 : 1 / refillRate;
  console.log({ retryAfter, remaining });

  return {
    allowed: !!allowed,
    remaining,
    retryAfter,
  };
};

const LEAKY_BUCKET_POLICING_SCRIPT = `

  local key = KEYS[1]
  local capacity = tonumber(ARGV[1])
  local leak_rate = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])

  local data = redis.call('HGETALL', key)
  local level = 0
  local last_leak = now

  if #data > 0 then
    local fields = {}

    for i = 1, #data, 2 do
      fields[data[i]] = data[i+1]
    end

    level = tonumber(fields['level'])
    last_leak = tonumber(fields['last_leak'])
  end

  local elapsed = now - last_leak
  local leaked = elapsed * leak_rate

  level = math.max(0, level - leaked)
  local allowed = 0

  if level + 1 <= capacity then
    level = level + 1
    allowed = 1
  end

  redis.call('HSET', key, 'level', level, 'last_leak', now)
  redis.call('EXPIRE', key, math.ceil(capacity/leak_rate) + 1)

  return {allowed, math.max(0, capacity - level), 0}

`;

const LEAKY_BUCKET_SHAPING_SCRIPT = `

  local key = KEYS[1]
  local capacity = tonumber(ARGV[1])
  local leak_rate = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])

  local next_free = now

  local data = redis.call('HGETALL', key)

  if #data > 0 then
    local fields = {}
    for i = 1, #data, 2 do
      fields[data[i]] = data[i+1]
    end

    next_free = tonumber(fields['next_free'])
  end

  if next_free < now then
    next_free = now
  end

  local delay = next_free - now
  local q_depth = delay * leak_rate

  local allowed = 0
  local delay_ms = 0

  if q_depth + 1 <= capacity then
    allowed = 1
    q_depth = q_depth + 1
    delay_ms = delay * 1000
    next_free = next_free + (1/leak_rate)
  end

  redis.call('HSET', key, 'next_free', next_free)
  redis.call('EXPIRE', key, math.ceil(capacity/leak_rate) + 1)

  return {allowed, math.max(0, capacity - q_depth), delay_ms}


`;

const leakyBucket = async (
  clientId: string,
  capacity: number,
  leakRate: number,
  isShaping?: boolean,
) => {
  const now = Date.now() / 1000;
  const [allowed, remaining, delayMs] = (await redisClient.eval(
    isShaping ? LEAKY_BUCKET_SHAPING_SCRIPT : LEAKY_BUCKET_POLICING_SCRIPT,
    {
      keys: [`${KEY_PREFIX}:leaky_bucket:policing:${clientId}`],
      arguments: [capacity.toString(), leakRate.toString(), now.toString()],
    },
  )) as [number, number, number];

  console.log({ allowed, remaining, delayMs });

  return {
    allowed: !!allowed,
    remaining,
    retryAfter: allowed ? 0 : Math.ceil(1 / leakRate),
  };
};

export const rateLimitMiddleWare = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const clientId = req.headers["clientid"]?.toString() || "";

  // const { allowed } = await fixedWindow(clientId, 60, 1);

  // const { allowed } = await slidingWindowLog(clientId, 60, 1);

  // const { allowed } = await slidingWindowCounter(clientId, 60, 1);

  // const { allowed } = await tokenBucket(clientId, 2, 0.05);
  const { allowed } = await leakyBucket(clientId, 2, 0.05);

  if (!allowed) return res.status(429).send("Max request exceeded");
  return next();
};
