<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';

  let enabled = $state(false);
  let screenStr = $state('');
  let innerStr = $state('');
  let docClientH = $state(0);
  let vvStr = $state('');
  let scrollY = $state(0);
  let appHeightStr = $state('');
  let safeStr = $state('');
  let standaloneStr = $state('');

  let probeEl: HTMLDivElement | undefined = $state();

  const round = (n: number) => Math.round(n);

  const syncFlag = () => {
    const flag = new URLSearchParams(location.search).get('vpdebug');
    if (flag === '1') {
      sessionStorage.setItem('vpdebug', '1');
    } else if (flag === '0') {
      sessionStorage.removeItem('vpdebug');
    }
    enabled = sessionStorage.getItem('vpdebug') === '1';
  };

  const update = () => {
    screenStr = `${round(screen.width)}×${round(screen.height)}`;
    innerStr = `${round(window.innerWidth)}×${round(window.innerHeight)}`;
    docClientH = round(document.documentElement.clientHeight);

    const vv = window.visualViewport;
    vvStr = vv ? `${round(vv.height)} off:${round(vv.offsetTop)} s:${round(vv.scale)}` : 'n/a';

    scrollY = round(window.scrollY);

    appHeightStr = getComputedStyle(document.documentElement)
      .getPropertyValue('--app-height')
      .trim();

    if (probeEl) {
      const cs = getComputedStyle(probeEl);
      const top = round(parseFloat(cs.paddingTop) || 0);
      const bottom = round(parseFloat(cs.paddingBottom) || 0);
      safeStr = `t${top} b${bottom}`;
    }

    standaloneStr = String(
      window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true,
    );
  };

  onMount(() => {
    syncFlag();
    update();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    const interval = window.setInterval(update, 500);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.clearInterval(interval);
    };
  });

  afterNavigate(() => {
    syncFlag();
    update();
  });
</script>

{#if enabled}
  <div class="vpdebug-overlay">
    <div>screen: {screenStr}</div>
    <div>inner: {innerStr}</div>
    <div>docClientH: {docClientH}</div>
    <div>vv: {vvStr}</div>
    <div>scrollY: {scrollY}</div>
    <div>--app-height: {appHeightStr}</div>
    <div>safe: {safeStr}</div>
    <div>standalone: {standaloneStr}</div>
  </div>
{/if}

<div bind:this={probeEl} class="vpdebug-probe" aria-hidden="true"></div>

<style>
  .vpdebug-overlay {
    position: fixed;
    top: max(8px, env(safe-area-inset-top));
    left: 8px;
    z-index: 9999;
    padding: 6px 8px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.75);
    color: #0f0;
    font-family: monospace;
    font-size: 10px;
    line-height: 1.4;
    white-space: pre;
    pointer-events: none;
  }

  .vpdebug-probe {
    position: fixed;
    top: -9999px;
    left: -9999px;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    visibility: hidden;
    pointer-events: none;
  }
</style>
