import { redis } from "../config/redis.js";

const WINDOW_MS = 10000; // 10 second sliding window
const MAX_MESSAGES = 10; // max messages per window

export async function isRateLimited(userId) {
  const key = `ratelimit:${userId}`;
  const now = Date.now();

  // Remove all entries older than the window 
  await redis.zRemRangeByScore(key, 0, now - WINDOW_MS);

  const count = await redis.zCard(key);
  if (count >= MAX_MESSAGES) return true; // blocked — don't record the attempt

  // Math.random() suffix makes the value unique even if two messages
  // arrive in the same millisecond — sorted sets silently deduplicate
  // members with identical values, which would undercount without this
  await redis.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
  await redis.expire(key, Math.ceil(WINDOW_MS / 1000));

  return false;
}