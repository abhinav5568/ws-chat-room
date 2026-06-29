import { createSession } from "../services/sessionService.js";
import { redis } from "../config/redis.js";
import { getPipe, pipeOptions } from "../services/pipeProvider.js";

const INTEREST_QUEUE = "chat:interest_queue";
const INTEREST_MAP = "user:interests";


const RANDOM_QUEUE = "chat:waiting_queue"; 

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
`;

// matchmaking loop waits
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// recursive matchMaking loop , max triess 3 per user
const MAX_TRIES = 3;
const BASE_WAIT_TIME = 2 * 1000;
const THRESHOLD = 0.95;
async function matchmakingLoop(userId, embeddingArray = [], tryCount = 1) {
  // must not exceed more tries
  if (tryCount > MAX_TRIES) return null;

  // check if the user requesting is already claimed by other user or not
  const isWaiting = await redis.sendCommand([
    "VISMEMBER",
    "user_interests",
    userId,
  ]);
  if (isWaiting == 0) {
    console.log(
      `[matchmakingLoop] ${userId} was already claimed by another match, stopping`,
    );
    return "ALREADY_MATCHED";
  }

  // try to find users with good scores related to this user
  console.log("entered the matchmaking loop ");
  const matchedUsers = await redis.vSimWithScores(
    "user_interests",
    embeddingArray,
    {
      COUNT: 2,
    },
  );
  console.log("response of vSimWithScores", typeof matchedUsers);
  let match = null;
  for (const [user, score] of Object.entries(matchedUsers)) {
    if (score > THRESHOLD && user != userId) {
      console.log(
        `[matchmakingLoop] user match found, ${userId} -> ${user}, score : ${score}`,
      );
      match = user;
      break;
    }
  }
  if (match != null) {
    // matchFound run the lua script to perform the popping opeartion without race condition
    const claimed = await redis.eval(CLAIM_SCRIPT, {
      keys: ["user_interests"],
      arguments: [userId, match],
    });

    if (claimed == 1) {
      console.log(
        "[matchmakingLoop] removed both the users sucessfully from the vector set",
      );
      return match;
    }
    console.log(`[matchmakingLoop] Lost claim race for ${match}, retrying`);
  }
  await sleep(BASE_WAIT_TIME);
  return matchmakingLoop(userId, embeddingArray, tryCount + 1);
}

async function tryInterestMatch(userId, interestString) {
  const pipe = await getPipe();
  const embedding = await pipe(interestString, pipeOptions);
  const embeddingArray = Array.from(embedding.data);

  // add the data to redis
  await redis.vAdd("user_interests", embeddingArray, userId); // vector set name, embedding, userId (uniquely idenitfies the vector array)

  // try the functio with redis based script to find user with similar interests 5 times with 2 seconds wait in between
  const res = await matchmakingLoop(userId, embeddingArray);

  // if failed then remove the user from the vector set, and try randomMatchmaking by default
  if (res === null) {
    const remFlag = await redis.vRem("user_interests", userId);
    // push to random matchmaking queue
    await redis.lPush(RANDOM_QUEUE, userId);
    if (remFlag == 1) {
      console.log(
        `Removed user ${userId} from interest based matchmaking queue`,
      );
    } else {
      console.log(
        `Could not remove user ${userId} from interest based matchmaking queue`,
      );
    }
    return;
  }
  if (res === "ALREADY_MATCHED") {
    return;
  }
  let sessionStatus;
  if (res != null) {
    // we got id of the candidate from the matchmakingLoop
    sessionStatus = await createSession(
      userId,
      res,
      `Matched with a score > 0.75.`,
    );
  }
}

export async function interestMatchWorker() {
  console.log("[interestMatchWorker] Worker started running...");
  // extracts the first user in the queue, and calls the tryInterestMatch for the

  while (true) {
    try {
      const candidateUser = await redis.lPop(INTEREST_QUEUE);
      if (candidateUser) {
        const interestString = await redis.hGet(INTEREST_MAP, candidateUser);
        await tryInterestMatch(candidateUser, interestString);
      }
    } catch (error) {
        console.error("[interestMatchWorker] Something went wrong:", error);
    }

    const jitter = Math.floor(Math.random() * 2) + 1; 
    const sleepTime = (2 + jitter) * 1000;
    
    await sleep(sleepTime);
  }
}
