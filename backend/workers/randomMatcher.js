import { createSession } from "../services/sessionService.js"; 
import { redis } from "../config/redis.js"; 

const RANDOM_QUEUE = "chat:waiting_queue"; 

const CLAIM_SCRIPT = `
 local list_len = redis.call('LLEN', KEYS[1])
 if list_len < 2 then return 0 end
 return redis.call('LPOP', KEYS[1], 2)
`;

function sleep(ms) { 
  return new Promise((resolve) => setTimeout(resolve, ms)); 
} 

async function tryRandomMatch() { 
  const queueLength = await redis.lLen(RANDOM_QUEUE); 
  
  if (queueLength < 2) { 
    console.log("[tryRandomMatch] Not enough users in queue yet"); 
    return; 
  } 

  const results = await redis.eval(CLAIM_SCRIPT, { 
    keys: [RANDOM_QUEUE], 
    arguments: [], 
  }); 

  if (results == 0) { 
    console.log(`[Random Matchmaking Worker] Not enough users in random matchmaking queue.`); 
  } else { 
    const userId = results[0]; 
    const otherUserId = results[1]; 

    if (!userId || !otherUserId) { 
      console.log("[tryRandomMatch] Random match failed — not enough users"); 
      return; 
    } 

    console.log(`[tryRandomMatch] Found a match ${userId} ↔ ${otherUserId}`); 
    await createSession(userId, otherUserId, []); 
  } 
}

// NEW: Infinite loop orchestrator
export async function startRandomMatchmakingWorker() {
  console.log("[RandomMatchmakingWorker] Worker started running...");
  
  while (true) {
    try {
      await tryRandomMatch();
    } catch (error) {
      console.error("[Worker Error] Something went wrong:", error);
    }

    // Jitter delay between 3000ms and 4000ms
    const jitter = Math.floor(Math.random() * 2) + 1; 
    const sleepTime = (2 + jitter) * 1000;
    
    await sleep(sleepTime);
  }
}
