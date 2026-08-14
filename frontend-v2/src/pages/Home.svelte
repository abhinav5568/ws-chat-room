<script>
</script>

<section class="home">
  <span class="eyebrow">// no signup required</span>
  <h1>Anonymous chat, on the open frequency.</h1>
  <p class="lede">
    Find random peers instantly. Tune into someone who shares your interests,
    or drop into the random queue and see who's out there.
  </p>

  <div class="features">
    <div class="feature">
      <span class="dot"></span>
      <p>Instant matching — no accounts, no history.</p>
    </div>
    <div class="feature">
      <span class="dot"></span>
      <p>Interest-based pairing for a better match.</p>
    </div>
  </div>

  <a href="/chat" class="cta">Enter chat →</a>
</section>

<style>
  .home {
    max-width: 560px;
    margin: 0 auto;
    padding: 4rem 1.25rem 2rem;
    color: var(--text);
    font-family: var(--font-sans);
  }
  .eyebrow {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    color: var(--signal);
    background: var(--signal-soft);
    border: 1px solid var(--signal-dim);
    border-radius: 999px;
    padding: 0.3rem 0.7rem;
    margin-bottom: 1.25rem;
  }
  h1 {
    font-size: clamp(1.8rem, 5vw, 2.6rem);
    line-height: 1.15;
    margin: 0 0 1rem;
    letter-spacing: -0.01em;
  }
  .lede {
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1.6;
    max-width: 44ch;
    margin: 0 0 2rem;
  }
  .features {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .feature {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
  }
  .feature p {
    margin: 0;
    font-size: 0.88rem;
    color: var(--text);
  }
  .feature .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--signal);
    flex-shrink: 0;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 2rem;
    padding: 0.75rem 1.5rem;
    background: var(--signal-soft);
    border: 1px solid var(--signal-dim);
    border-radius: var(--radius-sm);
    color: var(--signal);
    text-decoration: none;
    font-family: var(--font-mono);
    font-size: 0.9rem;
    letter-spacing: 0.02em;
    transition: background 0.15s ease, transform 0.1s ease;
  }
  .cta:hover {
    background: var(--signal-dim);
    color: var(--text);
    transform: translateY(-1px);
  }
</style>