import { Request, Response, NextFunction } from "express";
import { redisClient } from "./redis";

const KEY_PREFIX = "rateLimiter";
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
    keys: [`${KEY_PREFIX}:fixedWindow:${clientId}`],
    arguments: [windowSize.toString()],
  })) as [number, number];

  console.log({ count, pttl });

  const allowed = count <= maxRequest;

  return {
    allowed,
    remaining: Math.max(0, maxRequest - count),
    retryAfter: allowed ? 0 : pttl === 0 ? windowSize : pttl / 1000,
  };
};

export const rateLimitMiddleWare = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const clientId = req.headers["clientId"]?.toString() || "";

  const { allowed } = await fixedWindow(clientId, 60, 1);

  if (!allowed) return res.status(429).send("Max request exceeded");
  return next();
};
