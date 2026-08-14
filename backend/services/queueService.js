import { redis } from "../config/redis.js";
import { imMatchmaking, imTimeout } from "./matchmaking/interestMatcher.js";
import { rmMatchmaking, rmTimeout } from "./matchmaking/randomMatcher.js";
import { createSession } from "./sessionService.js";

// random matchmaking queue
const QUEUE_KEY = "chat:waiting_queue";

// interest based matchmaking queue
const INTEREST_QUEUE = "chat:interest_queue";
const INTEREST_MAP = "user:interests";

// tracks users waiting in the interest based or random matchmaking queue
const USERS_JOINED = "chat:users_queued";

// function to add user to random matchmaking queue or interest based matchmkaing queue
export async function joinQueue(ws, interests = []) {
  const userId = ws.userId;

  console.log(
    `[joinQueue] User ${userId} requested to be matched. Interests: [${interests.join(", ") || "none"}]`,
  );

  // if user already in the queue, then return, avoids adding same user twice to the matchmaking queues.
  const isAlreadyWaiting = await redis.hExists(USERS_JOINED, userId);

  // user already there, then return
  if(isAlreadyWaiting == 1) return;
  
  // otherwise add the user to the waiting queue, 
  await redis.hSet(USERS_JOINED, {
    [userId] : '1'
  })

  // interest based matchmaking if the user sent along some interests
  if (interests.length > 0) {
    // formatting the interest string
    const interestConv = interests.join(", ");
    // adding interests to interest map {userID: interestString}
    const h_flag = await redis.hSet(INTEREST_MAP, {
      [userId]: interestConv,
    }); // 0 unsucesfull 1 sucessfull

    // if user interests added to the map, then continue 
    if (h_flag) {
      console.log(
        `Added user: ${userId}, interests: ${interests.join(", ")} to the map sucessfully`,
      );
      await redis.hExpire(INTEREST_MAP, [userId], 60 * 5); // interests expire in 5 minutes
      
      // try interest based matchmaking
      await imMatchmaking(ws.userId, interestConv);
    } 
    // else return
    else {
      console.log(`[${userId}] Failed to add user to interest based queue.`);
    }
  } else {
    // try random matchmaking
    await rmMatchmaking(ws.userId);
  }
}

// cleaning queue and map for any stored interests after user requests to leave queue mid matchmaking, or frontend auto sends leave queue request
export async function leaveQueue(userId) {
  try {
    // try removing from both the random queue and interest based matchmaing queue
    await rmTimeout(userId)
    await imTimeout(userId)

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
