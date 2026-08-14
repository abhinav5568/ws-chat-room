<script>
  import "./themes/theme.css";
  import { Route, router } from "tinro";
  import Home from "./pages/Home.svelte";
  import Chat from "./pages/Chat.svelte";
  import Footer from "./components/Footer.svelte";
  import Navbar from "./components/Navbar.svelte";
  import NotFound from "./pages/NotFound.svelte";
  import { onMount, onDestroy } from "svelte";
  import { ws } from "./store/websocket.svelte";

  onMount(() => {
    console.log("App.svelte mounted!");
    ws.connect("ws://localhost:8080");
  });

  // onDestroy(() => {
  //   console.log("App.svelte is unmounted!")
  //   ws.disconnect();
  // })
</script>

<section class="app-shell">
  <Navbar />

  <main>
    <Route path="/"><Home /></Route>
    <Route path="/chat"><Chat /></Route>
    <Route fallback><NotFound /></Route>
  </main>

  <Footer />
</section>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  main {
    flex: 1;
  }
</style>