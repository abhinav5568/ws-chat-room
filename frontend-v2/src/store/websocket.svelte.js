// websocket.svelte.js
class GlobalWS {
  // Reactive states
  isConnected = $state(false); 
  matched = $state(false); 
  waiting = $state(false); 

  sessionKey = $state(null); 
  statusText = $state(null); 

  messages = $state([]); 
  typing = $state(false); // when other user is typing

  #socket = null;
  
  connect(url) {
    if (this.#socket) return;
    this.#socket = new WebSocket(url);

    this.#socket.onopen = () => {
      console.log("Connected to ws server.");
      this.isConnected = true; 
    };

    this.#socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("Received a message from server", msg);
        this.#handle(msg);
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    this.#socket.onclose = () => {
      console.log("onclose event handler fired");
      this.isConnected = false;
      this.#socket = null;
    };
  }

  disconnect() {
    if (this.#socket) {
      console.log("Disconnecting from the server.");
      this.#socket.close();
      this.#socket = null;
      this.isConnected = false;
    }
  }

  #handle(data) {
    try {
      switch (data.type) {
        case "STATUS_CHANGE":
          this.statusText = data.payload.message; 
          break;

        case "INIT_SESSION":
          document.cookie = `user_id=${data.payload.user_id}; max-age=86400; path=/`;
          this.statusText = "You're securely connected! No one knows who you are. Ready to meet someone new?";
          break;

        case "MATCHED":
          this.waiting = false; 
          this.sessionKey = data.payload.session_key;
          this.matched = true; 
          this.messages = []; 
          this.statusText = "Connected to a stranger.";
          break;

        case "MESSAGE":
          console.log('received text message from server')
          this.messages = [...this.messages, {
            sender: 'them', 
            text: data.payload.text
          }];
          break;

        case "TYPING":
          this.typing = data.payload.is_typing; 
          break;

        case "LEFT_SESSION": // fires from backend when you sucesfully leave a session
          this.matched = false;
          this.messages = []; 
          this.sessionKey = null;
          this.typing = false;
          this.statusText = "Chat ended. Hope you had a good conversation!"; 
          break;

        case "USER_DISCONNECTED":
          this.messages = [...this.messages, {
            sender: 'system', 
            text: 'Stranger left the chat'
          }];
          this.matched = false; 
          this.typing = false;
          this.sessionKey = null;
          this.statusText = "Poof! Your chat partner vanished into thin air. Let's find you someone else.";
          break;

        case "ERROR":
          this.statusText = data.payload.message;
          break;

        default:
          break;
      }
    } catch (err) {
      console.error("WS parse error:", err);
    }
  }

  joinQueue(interests = []){
	if (this.#socket.readyState !== WebSocket.OPEN) return;
    this.waiting = true;
    this.#socket.send(
      JSON.stringify({ type: "join_queue", payload: { interests } }),
    );
  }

  leaveQueue(){
	this.waiting = false;
	if(this.#socket.readyState !== WebSocket.OPEN) return;
	this.#socket.send(JSON.stringify({ type: "leave_queue" }));
  }

  sendText (text){
	const cleaned = text.trim();

	if (!text || this.#socket.readyState !== WebSocket.OPEN) return;
  console.log("sending text to  > ", this.sessionKey)
	this.#socket.send(
      JSON.stringify({
        type: "message",
        payload: { session_key: this.sessionKey, text:cleaned },
      }),
    );

	this.messages = [...this.messages, {
		sender: 'me', 
		text: text
	}]
  }

  leaveSession(){
	if (this.#socket.readyState !== WebSocket.OPEN) return;
   	this.#socket.send(
      JSON.stringify({
        type: "leave_session",
        payload: { session_key: this.sessionKey },
      }),
    );
    this.sessionKey = null

	// cautionary cleanup ,though backend resends the LEFT_SESSION message, which cleans the states
	this.matched = false;
	this.messages = []; 
    this.sessionKey = null;
    this.typing = false;
  }

  sendTypingStatus(isTyping){
    this.#socket.send(
      JSON.stringify({
        type: "typing",
        payload: { session_key: this.sessionKey, is_typing: isTyping },
      }),
    );
  }

  get websocket() {
    return this.#socket;
  }
}

export const ws = new GlobalWS();