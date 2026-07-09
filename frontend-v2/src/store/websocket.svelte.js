// websocket.svelte.js
class GlobalWS {
	// Reactive states
	isConnected = $state(false);
	latestMessage = $state(null);

	// Safe non-reactive private variable
	#socket = null;

	connect(url) {
		if (this.#socket) return;

		this.#socket = new WebSocket(url);

		this.#socket.onopen = () => {
			console.log('Connected to ws server.');
			this.isConnected = true; // Fixed: Now correctly updating state
		};

		this.#socket.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data);
				console.log('Received a message from server', msg);
				this.latestMessage = msg;
			} catch (err) {
				console.error('Failed to parse WS message:', err);
			}
		};

		this.#socket.onclose = () => {
			console.log('onclose event handler fired')
			this.isConnected = false;
			this.#socket = null;
		};
	}

	
	disconnect() {
		if (this.#socket) {
			console.log('Disconnecting from the server.');
			this.#socket.close();
			this.#socket = null;
			this.isConnected = false;
		}
	}

	// share the ws instance if available
	get websocket() {
		return this.#socket
	}
}

export const ws = new GlobalWS();