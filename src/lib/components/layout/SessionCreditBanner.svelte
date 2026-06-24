<script lang="ts">
  import { goto } from '$app/navigation';
  import * as m from '$paraglide/messages';
  import { mostUrgentCreditWarning, dismissCreditWarning } from '$lib/stores/creditWarnings';
  import { formatCountdown } from '$lib/utils/format';
  import { ROUTES } from '$lib/utils/routes';

  let now = $state(Date.now());

  $effect(() => {
    const w = $mostUrgentCreditWarning;
    if (!w || !w.terminate_at) return;

    const target = Date.parse(w.terminate_at);
    if (Number.isNaN(target)) return;

    const id = setInterval(() => {
      now = Date.now();
      if (now >= target) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  });

  const remainingMs = $derived(
    $mostUrgentCreditWarning?.terminate_at
      ? Math.max(0, Date.parse($mostUrgentCreditWarning.terminate_at) - now)
      : 0,
  );

  const isStopping = $derived(!$mostUrgentCreditWarning?.terminate_at || remainingMs <= 0);
</script>

{#if $mostUrgentCreditWarning}
  {@const warning = $mostUrgentCreditWarning}
  <div
    role={warning.level === 'critical' ? 'alert' : 'status'}
    aria-live={warning.level === 'critical' ? 'assertive' : 'polite'}
    class="banner"
    class:banner-warning={warning.level === 'warning'}
    class:banner-critical={warning.level === 'critical'}
  >
    <span class="banner-content">
      <!-- Screen-reader version: static text announced on appearance, not on every tick -->
      <span class="sr-only">
        {isStopping
          ? m.credit_banner_stopping()
          : warning.level === 'critical'
            ? m.credit_banner_critical_sr()
            : m.credit_banner_warning_sr()}
      </span>
      <!-- Visual version: live countdown hidden from screen readers -->
      <span aria-hidden="true">
        {isStopping
          ? m.credit_banner_stopping()
          : warning.level === 'critical'
            ? m.credit_banner_critical({ time: formatCountdown(remainingMs) })
            : m.credit_banner_warning({ time: formatCountdown(remainingMs) })}
      </span>
    </span>

    <button class="cta-btn" onclick={() => goto(ROUTES.billingTopUp)}>
      {m.credit_banner_cta_topup()}
    </button>

    <button
      class="dismiss-btn"
      onclick={() => dismissCreditWarning(warning.session_id)}
      aria-label={m.credit_banner_dismiss()}
    >
      ×
    </button>
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 90;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.15);
  }

  .banner-warning {
    background: color-mix(in srgb, var(--apex-warning) 15%, var(--apex-surface));
    border-top: 1px solid color-mix(in srgb, var(--apex-warning) 40%, transparent);
    color: var(--apex-warning);
  }

  .banner-critical {
    background: color-mix(in srgb, var(--apex-danger) 15%, var(--apex-surface));
    border-top: 1px solid color-mix(in srgb, var(--apex-danger) 40%, transparent);
    color: var(--apex-danger);
  }

  .banner-content {
    flex: 1;
    min-width: 0;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  .cta-btn {
    flex-shrink: 0;
    padding: 5px 14px;
    border-radius: 8px;
    border: 1px solid currentColor;
    background: transparent;
    color: inherit;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .cta-btn:hover {
    opacity: 0.8;
  }

  .dismiss-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    opacity: 0.7;
    border-radius: 4px;
    font-family: inherit;
  }

  .dismiss-btn:hover {
    opacity: 1;
  }
</style>
