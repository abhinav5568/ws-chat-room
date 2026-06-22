import { redis } from "../config/redis.js";
import { createSession } from "./sessionService.js";

const QUEUE_KEY = "chat:waiting_queue";

export async function joinQueue(userId, interests = []) {
  if (interests.length > 0) {
    await redis.sAdd(`interests:${userId}`, ...interests);
    await redis.expire(`interests:${userId}`, 3600);
  }

  await redis.rPush(QUEUE_KEY, userId);
  console.log(
    `User ${userId} joined queue. Interests: [${interests.join(", ") || "none"}]`,
  );

  const queueLength = await redis.lLen(QUEUE_KEY);
  if (queueLength < 2) {
    console.log("Not enough users in queue yet");
    return;
  }

  // try interest based matchmaking for limited amount of times, to allow for checking new users with similar interests
  const interestMatched = await tryInterestMatch(userId, interests, 10);
  if (!interestMatched) await tryRandomMatch(userId);
}


async function tryInterestMatch(userId, interests, count) {
  if (interests.length === 0) return false;

  if (count < 4) {
    count++;
    const queue = await redis.lRange(QUEUE_KEY, 0, -1);

    for (const candidateId of queue) {
      if (candidateId === userId) continue;

      const commonInterests = await redis.sInter(
        `interests:${userId}`,
        `interests:${candidateId}`,
      );

      if (commonInterests.length > 0) {
        const tx = redis.multi();
        tx.lRem(QUEUE_KEY, 1, userId);
        tx.lRem(QUEUE_KEY, 1, candidateId);
        const result = await tx.exec();

        const [removed1, removed2] = result;
        if (!removed1 || !removed2) {
          console.log(`Match collision on ${candidateId}, skipping`);
          continue; // try next candidate instead of giving up entirely
        }

        console.log(
          `Interest match: ${userId} ↔ ${candidateId} (${commonInterests.join(", ")})`,
        );
        await createSession(userId, candidateId, commonInterests);
        return true;
      }
    }
    setTimeout(tryInterestMatch(userId, interests, count), 2 * 1000);
  }else{
    return false;
  }
}


async function tryRandomMatch(userId) {
  const tx = redis.multi();
  tx.lRem(QUEUE_KEY, 1, userId);
  tx.lPop(QUEUE_KEY);
  const results = await tx.exec();

  if (!results) return;

  const removedCount = results[0];
  const otherUserId = results[1];

  if (!removedCount || !otherUserId) {
    console.log("Random match failed — not enough users");
    return;
  }

  console.log(`Random match: ${userId} ↔ ${otherUserId}`);
  await createSession(userId, otherUserId, []);
}

export async function leave_queue(userId) {
  try {
    await redis.lRem(QUEUE_KEY, 0, userId);
    console.log(`Removed user ${userId} from waiting queue`);
  } catch (error) {
    console.error("Error removing from the waiting queue:", error.message);
  }
}

export async function removeFromQueue(userId) {
  try {
    await redis.lRem(QUEUE_KEY, 0, userId);
    console.log(`Removed user ${userId} from queue`);
  } catch (err) {
    console.error(`Could not remove user ${userId} from queue:`, err.message);
  }
}
