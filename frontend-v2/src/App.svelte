<script>
  import { Route, router } from 'tinro';
  import Home from './pages/Home.svelte';
  import About from './pages/About.svelte';
  import Chat from './pages/Chat.svelte';
  import Footer from './components/Footer.svelte';
  import Navbar from './components/Navbar.svelte';
  import NotFound from './pages/NotFound.svelte';
  import { onMount, onDestroy } from 'svelte';
  import {ws} from './store/websocket.svelte'
  
  onMount(() => {
    console.log("App.svelte mounted!")
    ws.connect('ws://localhost:8080')
  });

  // onDestroy(() => {
  //   console.log("App.svelte is unmounted!")
  //   ws.disconnect();
  // })

</script>

<Navbar />

<main>
  <Route path="/"><Home /></Route>
  <Route path="/chat"><Chat /></Route>
  <Route path="/about"><About /></Route>
  <Route fallback><NotFound /></Route>
</main>

<Footer />