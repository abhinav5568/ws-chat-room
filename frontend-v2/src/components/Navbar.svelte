<script>
  import {ws} from '../store/websocket.svelte'
  
</script>

<nav>
  <div class="nav-buttons">
    <a href="/">Home</a>
    <a href="/chat">Chat</a>
    <a href="/about">About</a>
  </div>
  <div>
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
  }

  .nav-buttons{
    display: flex;
    flex-direction: row;
    gap: 2.5rem;
    flex-wrap: wrap;
    justify-content: space-between;
  }
</style>