import { createSession } from "../sessionService.js"; 
import { redis } from "../../config/redis.js"; 

const RANDOM_QUEUE = "chat:waiting_queue"; 

/**
 * Atomic Lua script to claim a match.
 * It checks if a stranger is available. If yes, it pops them. 
 * If no, it atomically adds the current user to the waiting queue.
 * This guarantees no race conditions and prevents users from matching with themselves.
 */
const RANDOM_MATCH_SCRIPT = `
-- Check if there is someone waiting in the queue
local waiting_user = redis.call('LPOP', KEYS[1])

if waiting_user then
    -- We found a match! Return the stranger's ID
    return waiting_user
else
    -- Queue is empty. Push the current user into the queue
    redis.call('RPUSH', KEYS[1], ARGV[1])
    return nil
end
`;

/**
 * Triggered exactly ONCE when a user initiates a random match.
 * No loops, no background workers. It executes instantly on join.
 */
export async function rmMatchmaking(userId) {
  try {
    console.log(`[RandomMatch] User ${userId} initiated random matchmaking.`);

    // Execute the atomic Lua script
    const matchedPartnerId = await redis.eval(RANDOM_MATCH_SCRIPT, { 
      keys: [RANDOM_QUEUE], 
      arguments: [userId], 
    }); 

    if (matchedPartnerId) {
      console.log(`[RandomMatch] Success! Random match found: ${userId} ↔ ${matchedPartnerId}`); 
      
      // Establish the chat room session. This notifies both users over WebSockets.
      await createSession(userId, matchedPartnerId, []); 
    }

    // If script returned nil, the user was successfully added to the queue to wait passively
    console.log(`[RandomMatch] No users available yet. Added ${userId} to waiting queue.`); 
  } catch (error) {
    console.error("[RandomMatch Error] Failed instant match execution:", error);
  }
}

export async function rmTimeout(userId) {
  // remove user from random matchmaking queue
  const rem_flag = await redis.lRem(RANDOM_QUEUE, 0, userId);
  // remove the user's waiting in the queue status
  await redis.hDel("chat:users_queued", userId);
  if(rem_flag === 1){
    console.log(`[RandomMatch]Timeout! User ${userId} is removed from the random matchmaking queue.`)
  }
}
