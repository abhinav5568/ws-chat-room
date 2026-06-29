import { redis } from "../config/redis.js";
import { createSession } from "./sessionService.js";
import { tryInterestMatch, tryRandomMatch } from "./matchMakingService.js";
import { ConvNextFeatureExtractor } from "@xenova/transformers";

const QUEUE_KEY = "chat:waiting_queue";
const INTEREST_QUEUE = "chat:interest_queue";
const INTEREST_MAP = "user:interests";

const USERS_JOINED = "chat:users_queued";

// handles whether to take user to interest based matchmaking or random matchmaking
export async function joinQueue(ws, interests = []) {
  const userId = ws.userId;

  console.log(
    `[joinQueue] User ${userId} requested to be matched. Interests: [${interests.join(", ") || "none"}]`,
  );

  // if user is already in any of the queues dont add it twice
  const isAlreadyWaiting = await redis.hExists(USERS_JOINED, userId);

  // user already there, then return
  if(isAlreadyWaiting == 1) return;
  
  // otherwise add the user to the waiting queue, 
  await redis.hSet(USERS_JOINED, {
    [userId] : '1'
  })

  // add user interests to a redis based map, and user to the interest based queue
  if (interests.length > 0) {
    const interestConv = interests.join(", ");
    const h_flag = await redis.hSet(INTEREST_MAP, {
      [userId]: interestConv,
    }); // 0 unsucesfull 1 sucessfull

    // sucesss, 
    if (h_flag) {
      console.log(
        `Added user: ${userId}, interests: ${interests.join(", ")} to the map sucessfully`,
      );
      await redis.hExpire(INTEREST_MAP, [userId], 60 * 5); // interests expire in 5 minutes
      const q_flag = await redis.lPush(INTEREST_QUEUE, userId); // push to interest based matchmaking queue
      if (q_flag) {
        console.log(`[${userId}] Added to interest based queue`);
      } else {
        console.log(`[${userId}] failed to add to interest based queue`);
      }
    } else {
      console.log(`[${userId}] Failed adding user to interest based queue`);
    }
  } else {
    // add user to random waiting queue
    const q_flag = await redis.lPush(QUEUE_KEY, userId);
    // server logs to see redis operation sucess or failure
    if (q_flag > 0) {
      console.log(`[${userId}] Added to the random waiting queue...`);
    } else {
      console.log(`[${userId}] Couldn't be added to the random waiting queue...`);
    }
  }
}

// cleaning queue and map for any stored interests after user requests to leave queue mid matchmaking
export async function leaveQueue(userId) {
  try {
    let remFlag = await redis.lRem(QUEUE_KEY, 0, userId) 
    await redis.lRem(INTEREST_QUEUE, 0, userId);

    // clean the interest and user state for the user
    await redis.hDel(INTEREST_MAP, userId)
    await  redis.hDel(USERS_JOINED, userId)
    if (remFlag === 1) {
      console.log(`[leaveQueue] Removed user ${userId} from waiting queue`);
    } else {
      console.log(`[leaveQueue] User ${userId} was not in the waiting queue`);
    }
  } catch (error) {
    console.error(
      "[leaveQueue] Error removing from the waiting queue:",
      error.message,
    );
  }
}

// cleaning queue after user disconnects from the server
export async function removeFromQueue(userId) {
  try {
    let remFlag = await redis.lRem(QUEUE_KEY, 0, userId) 
    await redis.lRem(INTEREST_QUEUE, 0, userId);
    await redis.hDel(INTEREST_MAP, userId)
    await redis.hDel(USERS_JOINED, userId)
    if (remFlag > 0) {
      console.log(`[removeFromQueue] Removed user ${userId} from queue`);
    } else {
      console.log(`[removeFromQueue] User ${userId} was not in the queue`);
    }
  } catch (err) {
    console.error(
      `[removeFromQueue] Could not remove user ${userId} from queue:`,
      err.message,
    );
  }
}
