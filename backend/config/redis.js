import { createClient } from "redis";

const redis = createClient({
  url: "redis://@127.0.0.1:6379",
});

redis.on("connect", () => console.log("Redis connected"));
redis.on("error", (err) =>
  console.error("Redis error", { message: err.message }),
);
redis.on("close", () => console.log("Redis connection closed"));

export const connectRedis = async () => {
  try {
    await redis.connect();
  } catch (error) {
    console.error("Redis connection failed.", error.message);
    process.exit(1);
  }
};

export { redis };
