import { createSession } from "../sessionService.js";
import { redis } from "../../config/redis.js";
import { getPipe, pipeOptions } from "../pipeProvider.js";


const INTEREST_QUEUE = "chat:interest_queue";
const INTEREST_MAP = "user:interests";

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

const THRESHOLD = 0.85;
async function helper(userId, embeddingArray = []) {

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
  const matchedUsers = await redis.vSimWithScores(
    "user_interests",
    embeddingArray,
    {
      COUNT: 2,
    },
  );
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
}

export async function imMatchmaking(userId, interestString) {
  const pipe = await getPipe();
  const embedding = await pipe(interestString, pipeOptions);
  const embeddingArray = Array.from(embedding.data);

  // add the user to the redis...
  await redis.vAdd("user_interests", embeddingArray, userId); // vector set name, embedding, userId (uniquely idenitfies the vector array)

  // try the function with redis based script to find user with similar interests 5 times with 2 seconds wait in between
  const res = await helper(userId, embeddingArray);

  if (res === "ALREADY_MATCHED") {
    return;
  }
  
  await createSession(
      userId,
      res,
      `Matched with a score > 0.75.`,
    );
}

export async function imTimeout(userId){
  // remove user from their vector store
  const remFlag = await redis.vRem("user_interests", userId);
  // remove them from their interest queue
  await redis.lRem(INTEREST_QUEUE, 1, userId)
  // delete interest mapping
  await redis.hDel(INTEREST_MAP, userId)
  // delete the waiting status
  await redis.hDel("chat:users_queued", userId)
  if(remFlag){
    console.log("Removed user from the vector set, stopping interest based matchmaking.")
  }
}
