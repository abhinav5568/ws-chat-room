// Shared in-memory map of userId → WebSocket instance.
// Exported as a singleton so every service file imports the same Map object.
const userMap = new Map();
export default userMap;