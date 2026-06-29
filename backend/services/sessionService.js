import { v4 as uuidv4 } from "uuid";
import { redis } from "../config/redis.js";
import userMap from "../state/userMap.js";

const SESSION_PREFIX = "chat:session:";

const USERS_JOINED = "chat:users_queued";

export async function createSession(user1, user2, commonInterests) {
  // random uuid to uniquely identify the session in redis hash...
  const sessionKey = `${SESSION_PREFIX}${uuidv4()}`;

  await redis.hSet(sessionKey, {
    [user1]: user2,
    [user2]: user1,
  });
  await redis.expire(sessionKey, 86400); // 24hr TTL


  const payload = JSON.stringify({
    type: "MATCHED",
    payload: {
      session_key: sessionKey,
      common_interests: commonInterests, 
    },
  });
  console.log('session key : ', sessionKey)

  const ws1 = userMap.get(user1);
  const ws2 = userMap.get(user2);

  if (ws1) { ws1.currentSessionKey = sessionKey; ws1.send(payload); }
  else{
    console.log('user1 websocket connection is not found')
    return "SESSION_NOT_CREATED"
  }
  if (ws2) { ws2.currentSessionKey = sessionKey; ws2.send(payload); }
  else{
    console.log('user 2 websocket connection not found')
    return "SESSION_NOT_CREATED"
  }


  // clear users from the USERS_JOINED map
  await redis.hDel(USERS_JOINED, user1)
  await redis.hDel(USERS_JOINED, user2)
  return "SESSION_CREATED"
}

export async function destroySession(sessionKey, disconnectedUserId) {
  const partnerId = await redis.hGet(sessionKey, disconnectedUserId);

  // Delete the session from Redis first
  await redis.del(sessionKey);

  // Then notify the partner if they're still connected
  if (partnerId) {
    const partnerWs = userMap.get(partnerId);
    if (partnerWs) {
      partnerWs.send(JSON.stringify({
        type: "USER_DISCONNECTED",
        payload: { message: "Stranger has left the chat." },
      }));
      partnerWs.currentSessionKey = null;
    }
  }
}

export async function handleMessage(senderId, payload) {
  const { session_key, text } = payload;

  const receiverId = await redis.hGet(session_key, senderId);
  if (!receiverId) {
    const senderWs = userMap.get(senderId);
    if (senderWs) {
      senderWs.send(JSON.stringify({
        type: "ERROR",
        payload: { message: "Session invalid or expired." },
      }));
    }
    return;
  }

  const receiverWs = userMap.get(receiverId);
  if (receiverWs) {
    receiverWs.send(JSON.stringify({
      type: "MESSAGE",
      payload: { text },
    }));
  }
}

export async function handleTyping(senderId, payload) {
  const { session_key, is_typing } = payload;

  const receiverId = await redis.hGet(session_key, senderId);
  if (!receiverId) return;

  const receiverWs = userMap.get(receiverId);
  if (receiverWs) {
    receiverWs.send(JSON.stringify({
      type: "TYPING",
      payload: { is_typing },
    }));
  }
}

export async function leaveSession(userId, sessionKey) {
  if (!sessionKey) return null;

  const partnerId = await redis.hGet(sessionKey, userId);

  // delete session first
  const flag = await redis.del(sessionKey);
  if(flag == 1){
    console.log('[leaveSession] Removed the session from hash, session id ', sessionKey)
  }else{
    console.log('[leaveSession] could not remove the session from hash, session id ', sessionKey)
  }

  // clear currentSessionKey on leaving user's ws
  const userWs = userMap.get(userId);
  if (userWs) userWs.currentSessionKey = null;

  // guard: partner may have already disconnected
  if (!partnerId) return null;

  const partnerWs = userMap.get(partnerId);
  if (partnerWs) {
    partnerWs.currentSessionKey = null;
    partnerWs.send(JSON.stringify({
      type: "USER_DISCONNECTED",
      payload: { message: "Stranger has left the chat." }
    }));
  }

  return partnerId;
}