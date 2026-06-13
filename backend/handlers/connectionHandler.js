import { v4 as uuidv4 } from "uuid";
import cookie from "cookie";
import { handleIncomingMessage } from "./messageHandler.js";
import { destroySession } from "../services/sessionService.js";
import { removeFromQueue } from "../services/queueService.js";
import { redis } from "../config/redis.js";
import userMap from "../state/userMap.js";

export function handleConnection(ws, req) {
  console.log("New client connected");

  // BUG FIX: cookie was being parsed but then ignored — a fresh UUID was
  // always generated. Now we reuse the cookie UUID if it exists, so a
  // user who refreshes keeps the same identity for the session duration.
  const rawCookie = req.headers.cookie || "";
  const parsedCookies = cookie.parse(rawCookie);
  const userId = parsedCookies.user_id || uuidv4();


  ws.userId = userId;
  userMap.set(userId, ws);

  // Tell the client their ID (new or restored)
  ws.send(JSON.stringify({
    type: "INIT_SESSION",
    payload: { user_id: userId },
  }));

  ws.send(JSON.stringify({
    type: "STATUS_CHANGE",
    payload: { message: "Connected. Ready to join a room." },
  }));

  ws.on("message", async (rawData) => {
    await handleIncomingMessage(ws, rawData);
  });

  ws.on("close", async () => {
    await handleClose(ws);
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error for user ${userId}:`, err.message);
  });
}

async function handleClose(ws) {
  const { userId, currentSessionKey } = ws;

  if (userId) {
    userMap.delete(userId);
    console.log(`User ${userId} disconnected`);

    // Remove from queue in case they disconnected while waiting
    await removeFromQueue(userId);
    // Clean up their interest set if they had one
    await redis.del(`interests:${userId}`);
  }

  if (currentSessionKey && userId) {
    try {
      await destroySession(currentSessionKey, userId);
      console.log('Session destroyed');
    } catch (err) {
      console.error("Session cleanup error:", err.message);
    }
  }else{
    console.log('Couldnt destroy session, currentSession key or the userId is not connected with ws object');
  }
}