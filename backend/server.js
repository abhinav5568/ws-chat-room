const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

// Map structure: socketA -> socketB (and vice-versa)
const userMap = new Map();

// Queue of users explicitly waiting for a random match
const waitingQueue = [];

console.log('WebSocket server is running on ws://localhost:8080');

function tryToMatchUsers() {
  // Check if we have at least 2 users waiting to chat
  if (waitingQueue.length >= 2) {
    console.log("Matching two random users...");
    const usr1 = waitingQueue.shift();
    const usr2 = waitingQueue.shift();

    // Symmetrically bind them together
    userMap.set(usr1, usr2);
    userMap.set(usr2, usr1);

    // Notify both users that they are connected
    usr1.send(JSON.stringify({ type: 'status', message: 'Connected to a stranger!' }));
    usr2.send(JSON.stringify({ type: 'status', message: 'Connected to a stranger!' }));
  }
}

function pingActiveCount() {
  // Total ongoing paired users + those sitting in the waiting queue
  const totalConnected = userMap.size + waitingQueue.length;
  console.log(`Active users: ${totalConnected} (Waiting: ${waitingQueue.length}, Paired: ${userMap.size})`);
}

wss.on('connection', (ws, req) => {
  console.log(`New client connected`);
  pingActiveCount();
  
  ws.send(JSON.stringify({ type: 'status', message: 'Welcome to the anonymous server!' }));

  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData);

      if (msg.type === 'join') {
        // Only put them in the queue if they aren't already waiting or paired
        if (!waitingQueue.includes(ws) && !userMap.has(ws)) {
          waitingQueue.push(ws);
          ws.send(JSON.stringify({ type: 'status', message: 'Searching for a stranger...' }));
          tryToMatchUsers();
        }
      } 
      
      else if (msg.type === 'message') {
        // Find who this socket is paired with
        const partner = userMap.get(ws);
        
        if (partner && partner.readyState === WebSocket.OPEN) {
          // Forward the text payload safely to the partner
          partner.send(JSON.stringify({
            type: 'message',
            text: msg.text || ""
          }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'You are not connected to anyone yet.' }));
        }
      }
    } catch (err) {
      console.error('Failed to parse incoming message string:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');

    // Scenario A: The user was still waiting in the queue
    const queueIndex = waitingQueue.indexOf(ws);
    if (queueIndex !== -1) {
      waitingQueue.splice(queueIndex, 1);
    }

    // Scenario B: The user was in an active chat room
    if (userMap.has(ws)) {
      const partner = userMap.get(ws);

      // Clean up maps for both individuals
      userMap.delete(ws);
      userMap.delete(partner);

      // Tell the partner their chat buddy left
      if (partner && partner.readyState === WebSocket.OPEN) {
        partner.send(JSON.stringify({ type: 'status', message: 'Stranger has disconnected.' }));
      }
    }

    pingActiveCount();
  });
});
