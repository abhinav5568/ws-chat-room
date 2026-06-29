import { redis } from "../config/redis.js";
import { createSession } from "./sessionService.js";
import { tryInterestMatch, tryRandomMatch } from "./matchMakingService.js";

const QUEUE_KEY = "chat:waiting_queue";

// handles whether to take user to interest based matchmaking or random matchmaking
export async function joinQueue(ws, interests = []) {
  const userId = ws.userId;

  console.log(
    `[joinQueue] User ${userId} requested to be matched. Interests: [${interests.join(", ") || "none"}]`,
  );


  let res = "NOT_MATCHED"; // default value is not matched
  if(interests.length > 0){
     console.log("[joinQueue] Try interest based matchmaking.")
    res = await tryInterestMatch(userId, interests);
  }
  console.log("[joinQueue] result of matchmaking : ", res);
  if(res == "NOT_MATCHED" || res == null) await tryRandomMatch(userId); // randomMatchmaking
}


// cleaning queue after user requests to leave queue mid matchmaking
export async function leaveQueue(userId) {
  try {
    const remFlag = await redis.lRem(QUEUE_KEY, 0, userId);
    if(remFlag === 1){
      console.log(`[leaveQueue] Removed user ${userId} from waiting queue`);
    }else{
      console.log(`[leaveQueue] User ${userId} was not in the waiting queue`);
    }
  } catch (error) {
    console.error("[leaveQueue] Error removing from the waiting queue:", error.message);
  }
}


// cleaning queue after user disconnects from the server
export async function removeFromQueue(userId) {
  try {
    const val = await redis.lRem(QUEUE_KEY, 0, userId);
    if(val > 0){
      console.log(`[removeFromQueue] Removed user ${userId} from queue`);
    }else{
      console.log(`[removeFromQueue] User ${userId} was not in the queue`)
    }
  } catch (err) {
    console.error(`[removeFromQueue] Could not remove user ${userId} from queue:`, err.message);
  }
}
