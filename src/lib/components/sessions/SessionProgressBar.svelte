<script lang="ts">
  import * as m from '$paraglide/messages';

  interface Props {
    status: string;
    progress: number | null;
    phase?: string | null;
  }

  let { status, progress, phase = null }: Props = $props();

  const isDeterminate = $derived(progress !== null && isFinite(progress));
  const width = $derived(isDeterminate ? Math.min(100, Math.max(0, progress!)) : 0);
</script>

<div
  class="progress-wrap"
  role="progressbar"
  aria-label={m.session_provisioning_phase()}
  aria-valuemin={isDeterminate ? 0 : undefined}
  aria-valuemax={isDeterminate ? 100 : undefined}
  aria-valuenow={isDeterminate ? width : undefined}
>
  {#if isDeterminate}
    <div class="progress-bar determinate" style="width: {width}%"></div>
  {:else}
    <div class="progress-bar indeterminate" class:paused={status === 'stopping'}></div>
  {/if}
  {#if phase}
    <span class="phase-label">{phase}</span>
  {/if}
</div>

<style>
  .progress-wrap {
    position: relative;
    height: 6px;
    border-radius: 3px;
    background: var(--apex-surface-hover);
    overflow: hidden;
    width: 100%;
  }

  .progress-bar {
    height: 100%;
    border-radius: 3px;
  }

  .progress-bar.determinate {
    background: var(--apex-accent);
    transition: width 0.4s ease;
  }

  .progress-bar.indeterminate {
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--apex-accent) 40%,
      var(--apex-accent-dim) 60%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.6s ease-in-out infinite;
    width: 100%;
  }

  .progress-bar.paused {
    animation-play-state: paused;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .progress-bar.indeterminate {
      animation: none;
      background: var(--apex-accent-glow);
      opacity: 0.7;
    }
  }

  .phase-label {
    position: absolute;
    top: 10px;
    left: 0;
    font-size: 10px;
    color: var(--apex-text-muted);
    text-transform: capitalize;
    letter-spacing: 0.02em;
  }
</style>
