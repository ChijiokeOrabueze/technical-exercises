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

export const rateLimitMiddleWare = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const clientId = req.headers["clientId"]?.toString() || "";

  // const { allowed } = await fixedWindow(clientId, 60, 1);

  const { allowed } = await slidingWindowLog(clientId, 60, 1);

  if (!allowed) return res.status(429).send("Max request exceeded");
  return next();
};
