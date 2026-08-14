<script>
  import { ws } from '../store/websocket.svelte'
</script>

<nav>
  <a href="/" class="brand">anon.chat</a>
  <div class="status">
    <span class="status-dot" class:status-on={ws.isConnected} class:status-off={!ws.isConnected}></span>
    {#if ws.isConnected}
      <p>Connected to the server.</p>
    {:else}
      <p>Disconnected from the server</p>
    {/if}
  </div>
</nav>

<style>
  nav {
    display: flex;
    flex-direction: row;
    gap: 2.5rem;
    flex-wrap: wrap;
    justify-content: space-around;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    font-family: var(--font-sans);
  }

  .brand {
    padding: 0.5rem;
    text-decoration: none;
    font-size: medium;
    font-weight: 600;
    color: var(--text);
    transition: color 0.15s ease;
  }

  .brand:hover {
    color: var(--signal);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status p {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-on {
    background: var(--signal);
    box-shadow: 0 0 6px 1px var(--signal);
  }

  .status-off {
    background: var(--flare);
    box-shadow: 0 0 6px 1px var(--flare);
  }
</style>