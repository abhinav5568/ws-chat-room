<script>
  import { ws } from "../store/websocket.svelte";

  let interests = $state([]);

  let interestInput = $state();
  let message = $state();
  let messagesEl = $state();

  // reactive state for the visible timer
  let countdown = $state(30);

  // typing indicator
  let limiter = false; // false - can send typing events to server, true - typing event already been sent, debounce timer for 3 seconds
  let typingTimeout;


  if (ws.isConnected) {
    console.log("ws connected and ready to be used in chat.svelte");
  }

  // Handle the 30-second matchmaking timeout and live countdown ticker
  $effect(() => {
    if (ws.waiting) {
      console.log("[Matchmaking] Started 30-second countdown ticker.");
      countdown = 30; // Reset countdown whenever we enter waiting state

      // Set up a 1-second interval to tick down the visual clock
      const intervalId = setInterval(() => {
        if (countdown > 1) {
          countdown -= 1;
        } else {
          console.log("[Matchmaking] Countdown reached 0. Leaving queue.");
          clearInterval(intervalId);
          ws.leaveQueue();
        }
      }, 1000);

      // Cleanup function clears the interval if matched, stopped, or page changes
      return () => {
        console.log("[Matchmaking] Clearing active countdown interval.");
        clearInterval(intervalId);
      };
    }
  });

  // auto-scroll to the latest message whenever the list changes
  $effect(() => {
    ws.messages.length;
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  });

  // checking state
  $inspect(interests);
  $inspect(ws.messages);
</script>

<section class="stage" class:stage-wide={ws.matched}>
  {#if ws.isConnected}
    {#if ws.matched}
      <div class="chat-window">
        <header class="chat-header">
          <a href="/" class="back-link" aria-label="Back to home">←</a>
          <span class="dot dot-live"></span>
          <span class="header-label">Connected to stranger</span>
        </header>

        <div class="messages" bind:this={messagesEl}>
          {#each ws.messages as msg, i}
            {#if msg.sender == "me"}
              <div class="bubble bubble-me">
                <span class="bubble-tag">you</span>
                <p>{msg.text}</p>
              </div>
            {:else if msg.sender == "them"}
              <div class="bubble bubble-them">
                <span class="bubble-tag">them</span>
                <p>{msg.text}</p>
              </div>
            {:else if msg.sender == "system"}
              <div class="bubble bubble-system">
                <p>{msg.text}</p>
              </div>
            {/if}
          {/each}
          {#if ws.typing}
            <div class="bubble bubble-system">Stranger is typing...</div>
          {/if}
        </div>

        <form class="composer" onsubmit={(e) => e.preventDefault()}>
          <input
            class="composer-input"
            bind:value={message}
            type="text"
            placeholder="Say something..."
            oninput={() => {
              clearTimeout(typingTimeout); 
              if (limiter === false) {
                limiter = true;
                ws.sendTypingStatus(true);
              }
              typingTimeout = setTimeout(() => {
                ws.sendTypingStatus(false);
                limiter = false;
              }, 3000);
            }}
          />
          <button
            class="btn btn-primary"
            onclick={() => {
              if (!message?.trim()) return;
              clearTimeout(typingTimeout);
              ws.sendTypingStatus(false);
              limiter = false;
              ws.sendText(message);
              message = "";
            }}
          >
            Send
          </button>
          <button
            onclick={() => {
              ws.leaveSession();
            }}
            class="btn btn-ghost">Leave chat</button
          >
        </form>
      </div>
    {:else if ws.waiting}
      <div class="waiting-panel">
        <div class="radar" aria-hidden="true">
          <div class="radar-ring ring-1"></div>
          <div class="radar-ring ring-2"></div>
          <div class="radar-ring ring-3"></div>
          <div class="radar-sweep"></div>
          <div class="radar-dot"></div>
        </div>

        <!-- Live Countdown UI Anchor -->
        <div class="timer-badge">
          Searching for {countdown}s...
        </div>

        <p class="waiting-label">Scanning for a signal…</p>
        <p class="waiting-sub">Hang tight, we're pairing you with someone.</p>
        <button
          onclick={() => {
            ws.leaveQueue();
          }}
          class="btn btn-ghost">Stop</button
        >
      </div>
    {:else}
      <div class="lobby">
        <div class="lobby-intro">
          <a href="/" class="back-link" aria-label="Back to home">←</a>
          <h3>Connected and ready to chat.</h3>
          <p class="hint">
            Note: pressing "Find strangers" without any interests puts you in
            the random matchmaking queue.
          </p>
        </div>

        <form class="interest-form" onsubmit={(e) => e.preventDefault()}>
          <label for="interestInput">Your interests</label>
          <div class="interest-input-row">
            <input
              id="interestInput"
              type="text"
              placeholder="e.g. synths, hiking, cats"
              bind:value={interestInput}
            />
            <button
              class="btn btn-ghost"
              onclick={(e) => {
                e.preventDefault();
                if (interestInput) {
                  interests = [...interests, interestInput];
                  interestInput = "";
                }
              }}
            >
              Add
            </button>
          </div>
        </form>

        <div class="chip-row">
          {#each interests as interest, i}
            <span class="chip">
              {interest}
              <button
                class="chip-remove"
                aria-label="Remove {interest}"
                onclick={() => {
                  interests.splice(i, 1);
                }}
              >
                ×
              </button>
            </span>
          {:else}
            <span class="chip-empty">No interests added yet</span>
          {/each}
        </div>

        <button
          class="btn btn-primary btn-block"
          onclick={() => {
            ws.joinQueue(interests);
            interests = [];
          }}
        >
          Find strangers
        </button>
      </div>
    {/if}
  {:else}
    <div class="offline-panel">
      <span class="dot dot-offline"></span>
      <p>Not connected to the server, refresh the page or try again later.</p>
    </div>
  {/if}
</section>

<style>
  .stage {
    max-width: 480px;
    margin: 0 auto;
    padding: 2rem 1.25rem;
    font-family: var(--font-sans);
    color: var(--text);
    transition: max-width 0.2s ease;
  }
  .stage-wide {
    max-width: 820px;
  }

  /* ---- shared bits ---- */
  .btn {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    letter-spacing: 0.02em;
    border-radius: var(--radius-sm);
    padding: 0.6rem 1.1rem;
    border: 1px solid var(--border);
    background: var(--surface-raised);
    color: var(--text);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.1s ease;
  }
  .btn:hover {
    border-color: var(--signal-dim);
    transform: translateY(-1px);
  }
  .btn-primary {
    background: var(--signal-soft);
    border-color: var(--signal-dim);
    color: var(--signal);
  }
  .btn-primary:hover {
    background: var(--signal-dim);
    color: var(--text);
  }
  .btn-ghost {
    background: transparent;
  }
  .btn-block {
    width: 100%;
    margin-top: 1.25rem;
    padding: 0.75rem 1rem;
  }

  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot-live {
    background: var(--signal);
    box-shadow: 0 0 0 3px var(--signal-soft);
  }
  .dot-offline {
    background: var(--flare);
    box-shadow: 0 0 0 3px var(--flare-soft);
  }

  /* ---- offline ---- */
  .offline-panel {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem 1.1rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  /* ---- lobby ---- */
  .lobby {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
  }
  .lobby-intro h3 {
    margin: 0 0 0.4rem;
    font-size: 1.1rem;
  }
  .hint {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.82rem;
    line-height: 1.4;
  }
  .interest-form {
    margin-top: 1.25rem;
  }
  .interest-form label {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-bottom: 0.4rem;
  }
  .interest-input-row {
    display: flex;
    gap: 0.5rem;
  }
  .interest-input-row input {
    flex: 1;
  }
  input[type="text"] {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.6rem 0.75rem;
    color: var(--text);
    font-family: var(--font-sans);
    font-size: 0.9rem;
  }
  input[type="text"]::placeholder {
    color: var(--text-faint);
  }
  input[type="text"]:focus {
    border-color: var(--signal-dim);
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
    min-height: 1.5rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--signal-soft);
    border: 1px solid var(--signal-dim);
    color: var(--signal);
    font-family: var(--font-mono);
    font-size: 0.78rem;
    border-radius: 999px;
    padding: 0.3rem 0.4rem 0.3rem 0.7rem;
  }
  .chip-remove {
    background: none;
    border: none;
    color: var(--signal);
    opacity: 0.7;
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
    padding: 0 0.15rem;
  }
  .chip-remove:hover {
    opacity: 1;
  }
  .chip-empty {
    color: var(--text-faint);
    font-size: 0.82rem;
    font-style: italic;
  }

  /* ---- waiting / radar ---- */
  .waiting-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 2.5rem 1.5rem;
  }
  .radar {
    position: relative;
    width: 140px;
    height: 140px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--signal-soft) 0%, transparent 70%);
    margin-bottom: 1.5rem;
    overflow: hidden;
  }
  .radar-ring {
    position: absolute;
    inset: 0;
    border: 1px solid var(--signal-dim);
    border-radius: 50%;
    animation: pulse-ring 2.4s ease-out infinite;
  }
  .ring-2 {
    animation-delay: 0.6s;
  }
  .ring-3 {
    animation-delay: 1.2s;
  }
  .radar-sweep {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(from 0deg, var(--signal-soft), transparent 35%);
    animation: sweep 2.8s linear infinite;
  }
  .radar-dot {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--signal);
    box-shadow: 0 0 12px 2px var(--signal);
    transform: translate(-50%, -50%);
  }
  @keyframes sweep {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes pulse-ring {
    0% {
      transform: scale(0.3);
      opacity: 0.8;
    }
    100% {
      transform: scale(1);
      opacity: 0;
    }
  }
  .waiting-label {
    font-family: var(--font-mono);
    font-size: 0.95rem;
    color: var(--text);
    margin: 0;
  }
  .waiting-sub {
    color: var(--text-muted);
    font-size: 0.82rem;
    margin: 0.35rem 0 1.25rem;
  }

  /* ---- chat window ---- */
  .chat-window {
    display: flex;
    flex-direction: column;
    height: 85vh;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  .chat-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.9rem 1.1rem;
    border-bottom: 1px solid var(--border-soft);
    background: var(--surface-raised);
  }
  .back-link {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 1.1rem;
    line-height: 1;
    margin-right: 0.3rem;
    transition: color 0.15s ease;
  }
  .back-link:hover {
    color: var(--signal);
  }
  .header-label {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--text-muted);
    letter-spacing: 0.02em;
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .bubble {
    max-width: 78%;
    padding: 0.55rem 0.8rem;
    border-radius: var(--radius);
    font-size: 0.9rem;
    line-height: 1.4;
  }
  .bubble p {
    margin: 0;
  }
  .bubble-tag {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    opacity: 0.6;
    margin-bottom: 0.15rem;
  }
  .bubble-me {
    align-self: flex-end;
    background: var(--signal-soft);
    color: var(--text);
    border: 1px solid var(--signal-dim);
  }
  .bubble-them {
    align-self: flex-start;
    background: var(--flare-soft);
    color: var(--text);
    border: 1px solid rgba(255, 138, 101, 0.3);
  }
  .bubble-system {
    align-self: center;
    background: transparent;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }
  .composer {
    display: flex;
    gap: 0.5rem;
    padding: 0.8rem;
    border-top: 1px solid var(--border-soft);
    background: var(--surface-raised);
  }
  .composer-input {
    flex: 1;
  }

  .timer-badge {
    font-family: monospace; /* Prevents text layout shifting while numbers change */
    font-size: 0.9rem;
    font-weight: bold;
    background-color: rgba(0, 0, 0, 0.05);
    padding: 4px 12px;
    border-radius: 20px;
    margin-bottom: 12px;
    color: #666;
  }
</style>
