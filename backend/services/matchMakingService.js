import { createSession } from "./sessionService.js";
import { redis } from "../config/redis.js";
import { getPipe, pipeOptions } from "./pipeProvider.js";

const QUEUE_KEY = "chat:waiting_queue";

//lua script to check both the matching candidates exist in the redis vector,or they're removed already
let CLAIM_SCRIPT = `
local selfExists = redis.call('VISMEMBER', KEYS[1], ARGV[1])
local partnerExists = redis.call('VISMEMBER', KEYS[1], ARGV[2])

if selfExists == 1 and partnerExists == 1 then
  redis.call('VREM', KEYS[1], ARGV[1])
  redis.call('VREM', KEYS[1], ARGV[2])
  return 1
else
  return 0
end
`
// matchmaking loop waits 
function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// recursive matchMaking loop 
const MAX_TRIES = 5;
const BASE_WAIT_TIME = 2 * 1000;
const THRESHOLD = 0.75;
async function matchmakingLoop(userId, embeddingArray = [], tryCount = 1) {
  // must not exceed more tries
  if(tryCount > MAX_TRIES) return null;

  // check if the user requesting is already claimed by other user or not
  const isWaiting = await redis.sendCommand(["VISMEMBER", "user_interests", userId]);
  if(isWaiting == 0){
    console.log(`[matchmakingLoop] ${userId} was already claimed by another match, stopping`);
    return "ALREADY_MATCHED";
  }

  // try to find users with good scores related to this user
  console.log('entered the matchmaking loop ')
  const matchedUsers = await redis.vSimWithScores('user_interests', embeddingArray, {
    COUNT:2
  })
  console.log('response of vSimWithScores', typeof(matchedUsers))
  let match = null;
  for(const [user, score] of Object.entries(matchedUsers)){
      if(score > 0.75 && user != userId){
        console.log(`[matchmakingLoop] user match found, ${userId} -> ${user}, score : ${score}`)
        match = user;
        break;
      }
  }
  if(match != null){
    // matchFound run the lua script to perform the popping opeartion without race condition
    const claimed = await redis.eval(CLAIM_SCRIPT, {
      keys: ["user_interests"],
      arguments: [userId, match],
    });

    if(claimed == 1){
      console.log('[matchmakingLoop] removed both the users sucessfully from the vector set');
      return match;
    }
    console.log(`[matchmakingLoop] Lost claim race for ${match}, retrying`);
  }
  await sleep(BASE_WAIT_TIME);
  return matchmakingLoop(userId, embeddingArray, tryCount + 1);
}


export async function tryInterestMatch(userId, interests = []) {
  const interestString = interests.join(", ");
  const pipe = await getPipe();
  const embedding = await pipe(interestString, pipeOptions);
  const embeddingArray = Array.from(embedding.data);

  // add the data to redis
  await redis.vAdd('user_interests',embeddingArray, userId) // vector set name, embedding, userId (uniquely idenitfies the vector array)

  // try the functio with redis based script to find user with similar interests 5 times with 2 seconds wait in between
  const res = await matchmakingLoop(userId, embeddingArray)

  // if failed then remove the user from the vector set, and try randomMatchmaking by default
  if(res === null){
    const remFlag = await redis.vRem('user_interests', userId);
    if(remFlag == 1){
      console.log(`Removed user ${userId} from interest based matchmaking queue`)
    }else{
      console.log(`Could not remove user ${userId} from interest based matchmaking queue`)
    }
    return "NOT_MATCHED";
  }
  if(res === "ALREADY_MATCHED"){
    return "MATCHED";
  }
  let sessionStatus;
  if(res != null){
    // we got id of the candidate from the matchmakingLoop 
    sessionStatus = await createSession(userId, res, `Matched with a score > 0.75.`)
  }
  if(sessionStatus == "SESSION_CREATED"){
    return "MATCHED"
  }
  return "NOT_MATCHED"
}


// fallback, random matchmaking

export async function tryRandomMatch(userId) {
  // add user to the random queue
  await redis.rPush(QUEUE_KEY, userId);

  const queueLength = await redis.lLen(QUEUE_KEY);
  if (queueLength < 2) {
    console.log("[tryRandomMatch] Not enough users in queue yet");
    return;
  }
  
  // create a transaction to facilitate atomic pop
  const tx = redis.multi();
  tx.lRem(QUEUE_KEY, 1, userId);
  tx.lPop(QUEUE_KEY);

  // get the result
  const results = await tx.exec();

  if (!results) return;

  const dltFlag = results[0]; // 0 for not deleted and 1 for deleted
  const otherUserId = results[1];


  // error handled, if the deleteFlag is 0 or there's no other user returned
  if (!dltFlag || !otherUserId) {
    console.log("[tryRandomMatch] Random match failed — not enough users");
    return;
  }

  console.log(`[tryRandomMatch] Found a match ${userId} ↔ ${otherUserId}`)

  // create a session
  await createSession(userId, otherUserId, []);
}