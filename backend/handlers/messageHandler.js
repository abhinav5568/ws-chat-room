import { joinQueue, leaveQueue } from "../services/queueService.js";
import { handleMessage, handleTyping, leaveSession } from "../services/sessionService.js";
import { isRateLimited } from "../services/rateLimitService.js";
import userMap from "../state/userMap.js";


const MESSAGE_HANDLERS = {
  join_queue:    handleJoin, // joins the waiting queue (either random matchmaking)
  message: handleChat, // forward messages to the user connected via session stored in redis hash
  typing:  handleTypingIndicator,  // typing indicator
  leave_queue: handleLeaveWaitQueue, // leave the waiting queue (user waiting to get matched)
  leave_session: handleLeaveSession, // leave an ongoing session with other user
};

export async function handleIncomingMessage(ws, rawData) {
  let msg;
  try {
    msg = JSON.parse(rawData.toString());
  } catch {
    sendError(ws, "Invalid message format.");
    return;
  }

  const handler = MESSAGE_HANDLERS[msg.type];
  console.log('message type : ', msg.type)
  if (!handler) {
    sendError(ws, `Unknown message type: ${msg.type}`);
    return;
  }

  try {
    await handler(ws, msg.payload || {});
  } catch (err) {
    console.error(`[handleIncomingMessages] Error handling "${msg.type}" for user ${ws.userId}:`, err.message);
    sendError(ws, "[handleIncomingMessages] An internal error occurred.");
  }
}

// ---------- individual type handlers ----------
async function handleJoin(ws, payload) {
  const { interests = [] } = payload;

  // Sanitize interests: lowercase, trim, max 3 tags, max 20 chars each
  const userInterests = interests
    .map((i) => i.toString().toLowerCase().trim())
    .filter((i) => i.length > 0 && i.length <= 20)
    .slice(0, 3);

  // notify the user about request received  
  ws.send(JSON.stringify({
    type: "STATUS_CHANGE",
    payload: { message: userInterests.length > 0
      ? `Searching for someone who likes: ${userInterests.join(", ")}...`
      : "Searching for a stranger..." },
  }));

  // joinQueue in the queueService puts the user in their respective queus for searching a match. 
  await joinQueue(ws, userInterests);
}

async function handleChat(ws, payload) {
  const { session_key, text } = payload;

  if (!session_key || !text?.trim()) return;

  // Rate limit check happens before anything else
  const limited = await isRateLimited(ws.userId);
  if (limited) {
    sendError(ws, "Slow down! You are sending messages too fast.");
    return;
  }

  // Server-side length cap — frontend limit alone is never enough
  if (text.length > 300) {
    sendError(ws, "Message too long. Max 300 characters.");
    return;
  }

  await handleMessage(ws.userId, payload);
}

async function handleTypingIndicator(ws, payload) {
  const { session_key, is_typing } = payload;
  if (!session_key) return;
  await handleTyping(ws.userId, { session_key, is_typing });
}

async function handleLeaveWaitQueue(ws) {
  const userId = ws.userId;
  await leaveQueue(userId);
  ws.send(
    JSON.stringify({
      type: "STATUS_CHANGE", 
      payload: {
        message: "Left waiting queue, lets find new stranger to chat."
      }
    })
  )
}

async function handleLeaveSession(ws, payload) {
  const session_key = payload.session_key || ws.currentSessionKey
  const userId = ws.userId;

  if (!session_key) {
    sendError(ws, "No active session.");
    return;
  }

  await leaveSession(userId, session_key);
  ws.currentSessionKey = null;

  ws.send(JSON.stringify({
    type: "LEFT_SESSION",
    payload: { message: "You disconnected from stranger. " }
  }));
}

// ---------- utility ----------

function sendError(ws, message) {
  ws.send(JSON.stringify({ type: "ERROR", payload: { message } }));
}