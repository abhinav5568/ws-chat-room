import { WebSocketServer } from "ws";
import { connectRedis } from "./config/redis.js";
import { handleConnection } from "./handlers/connectionHandler.js";

await connectRedis();

const wss = new WebSocketServer({ port: 8080 });
console.log("WebSocket server is running on ws://localhost:8080");

wss.on("connection", (ws, req) => {
  handleConnection(ws, req);
});