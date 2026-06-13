import { joinQueue, leave_queue } from "../services/queueService.js";
import { handleMessage, handleTyping } from "../services/sessionService.js";
import { isRateLimited } from "../services/rateLimitService.js";
import userMap from "../state/userMap.js";

// To add a new message type: write its handler below, add one line to this map.
const MESSAGE_HANDLERS = {
  join:    handleJoin,
  message: handleChat,
  typing:  handleTypingIndicator,
  leave_wait_queue: handleLeaveWaitQueue
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

  if (!handler) {
    sendError(ws, `Unknown message type: ${msg.type}`);
    return;
  }

  try {
    await handler(ws, msg.payload || {});
  } catch (err) {
    console.error(`Error handling "${msg.type}" for user ${ws.userId}:`, err.message);
    sendError(ws, "An internal error occurred.");
  }
}

// ---------- individual type handlers ----------

async function handleJoin(ws, payload) {
  const { interests = [] } = payload;

  // Sanitize interests: lowercase, trim, max 5 tags, max 20 chars each
  const cleaned = interests
    .map((i) => i.toString().toLowerCase().trim())
    .filter((i) => i.length > 0 && i.length <= 20)
    .slice(0, 5);

  ws.send(JSON.stringify({
    type: "STATUS_CHANGE",
    payload: { message: cleaned.length > 0
      ? `Searching for someone who likes: ${cleaned.join(", ")}...`
      : "Searching for a stranger..." },
  }));

  await joinQueue(ws.userId, cleaned);
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
  await leave_queue(userId);
  ws.send(
    JSON.stringify({
      type: "STATUS_CHANGE", 
      payload: {
        message: "Left waiting queue, lets find new stranger to chat."
      }
    })
  )
}

// ---------- utility ----------

function sendError(ws, message) {
  ws.send(JSON.stringify({ type: "ERROR", payload: { message } }));
}