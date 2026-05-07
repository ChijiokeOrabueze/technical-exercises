import redis from "redis";

export const redisClient = await redis
  .createClient({
    // username: "default",
    password: "9oyVlup1xEteXPOgZaxG0ZqpCFsllSgE",
    socket: {
      host: "redis-14236.c311.eu-central-1-1.ec2.cloud.redislabs.com",
      port: 14236,
    },
  })
  .on("error", (err) => console.log("Redis connect error", err))
  .connect();
