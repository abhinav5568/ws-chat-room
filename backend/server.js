import { WebSocketServer } from "ws";
import { connectRedis } from "./config/redis.js";
import { handleConnection } from "./handlers/connectionHandler.js";

import { startRandomMatchmakingWorker } from "./workers/randomMatcher.js";
import { interestMatchWorker } from "./workers/interestMatcher.js";

await connectRedis();
startRandomMatchmakingWorker();
interestMatchWorker();

const wss = new WebSocketServer({ port: 8080 });
console.log("WebSocket server is running on ws://localhost:8080");

wss.on("connection", (ws, req) => {
  handleConnection(ws, req);
});