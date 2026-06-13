import { redis } from "../config/redis.js";
import { createSession } from "./sessionService.js";

const QUEUE_KEY = "chat:waiting_queue";

export async function joinQueue(userId, interests = []) {
  // Store interests as a Redis Set so we can do intersection checks
  if (interests.length > 0) {
    await redis.sAdd(`interests:${userId}`, ...interests);
    await redis.expire(`interests:${userId}`, 3600); // auto-clean after 1hr
  }

  await redis.rPush(QUEUE_KEY, userId);
  console.log(
    `User ${userId} joined queue. Interests: [${interests.join(", ") || "none"}]`,
  );

  // if queue length is valid, to add second user 
  const queueLength = await redis.lLen(QUEUE_KEY);
  if (queueLength >= 2) {
    // try interest based matchmaking
    const interestMatched = await tryInterestMatch(userId, interests);
    if (interestMatched) return;

    // fall back to random matchmacking
    await tryRandomMatch(userId);
  }else{
    console.log('Not enough users in the waiting_queue');
  }
}

export async function removeFromQueue(userId) {
  try {
    // lRem(key, count=0, value) removes ALL occurrences of value
    await redis.lRem(QUEUE_KEY, 0, userId);
  } catch (err) {
    console.error(`Could not remove user ${userId} from queue:`, err.message);
  }
}

// ---------- matching strategies ---------
async function tryInterestMatch(userId, interests) {
  if (interests.length === 0) return false;

  // Read the full queue to search for a compatible candidate
  const queue = await redis.lRange(QUEUE_KEY, 0, -1);

  for (const candidateId of queue) {
    if (candidateId === userId) continue;

    // sInter returns elements that exist in BOTH sets
    const commonInterests = await redis.sInter(
      `interests:${userId}`,
      `interests:${candidateId}`,
    );

    if (commonInterests.length > 0) {
      // Atomically remove both from queue before creating session
      // transactions to fix concurrency issues
      const tx = await redis.multi();
      tx.lRem(QUEUE_KEY, 0, userId);
      tx.lRem(QUEUE_KEY, 0, candidateId);
      const result = await tx.exec();
      console.log(
        `Interest match: ${userId} ↔ ${candidateId} (${commonInterests.join(", ")})`,
      );
      await createSession(userId, candidateId, commonInterests);
      return true;
    }
  }

  return false;
}

async function tryRandomMatch(userId) {
  // Use a transaction so both pops succeed or neither does
  const tx = redis.multi();
  tx.lRem(QUEUE_KEY, 0, userId); // remove the user
  tx.lPop(QUEUE_KEY); // random other user with him
  const results = await tx.exec();

  if (!results) return;

  const [user1, user2] = results;
  if (!user1 || !user2) {
    console.log("Not enough users in queue for random match");
    return;
  }

  console.log(`Random match: ${user1} ↔ ${user2}`);
  await createSession(user1, user2, []);
}

export async function leave_queue(userId) {
  try {
    await redis.lPop(QUEUE_KEY, 0, userId);
    console.log('removed user from waiting queue', userId);
  } catch (error) {
    console.log('Error removing from the waiting queue...', error.message);
  }
} 
