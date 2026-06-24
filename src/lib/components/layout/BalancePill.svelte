<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import apiClient from '$lib/api/client';
  import { formatNumber } from '$lib/utils/format';
  import { isSSEConnected } from '$lib/stores/eventStream';
  import * as m from '$paraglide/messages';

  const balanceQuery = createQuery(() => ({
    queryKey: ['balance'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/v1/billing/balance');
      return data ?? null;
    },
    staleTime: 30_000,
    // When SSE is connected, it pushes balance updates — no need to poll.
    // When SSE is down, fall back to 30s polling.
    refetchInterval: $isSSEConnected ? false : 30_000,
    refetchOnWindowFocus: true,
  }));

  const balance = $derived(balanceQuery.data?.balance);
  const isDebt = $derived(typeof balance === 'number' && balance < 0);
  const debtLabel = $derived(
    isDebt
      ? m.balance_debt_label({ n: formatNumber(Math.abs(balance!)) })
      : m.topbar_balance({ amount: formatNumber(balance ?? 0) }),
  );
</script>

<a
  href={isDebt ? '/app/billing/buy' : '/app/billing'}
  class="pill"
  class:debt={isDebt}
  aria-label={balanceQuery.isLoading ? 'Loading balance' : debtLabel}
  title={isDebt ? debtLabel : undefined}
>
  <span class="pill-symbol">◈</span>
  {#if balanceQuery.isLoading}
    <span class="loading-skel"></span>
  {:else}
    {balance !== undefined && balance !== null ? formatNumber(balance) : '—'}
  {/if}
</a>

<style>
  .pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--apex-accent-dim) 9%, transparent);
    border: 1px solid color-mix(in srgb, var(--apex-accent-dim) 20%, transparent);
    border-radius: 16px;
    font-size: 12px;
    font-weight: 600;
    color: var(--apex-accent);
    font-family: 'JetBrains Mono', monospace;
    text-decoration: none;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .pill:hover {
    border-color: color-mix(in srgb, var(--apex-accent-dim) 40%, transparent);
  }

  .pill.debt {
    background: color-mix(in srgb, var(--apex-danger) 9%, transparent);
    border-color: color-mix(in srgb, var(--apex-danger) 25%, transparent);
    color: var(--apex-danger);
  }

  .pill.debt:hover {
    border-color: color-mix(in srgb, var(--apex-danger) 45%, transparent);
  }

  .pill-symbol {
    font-size: 9px;
  }

  .loading-skel {
    display: inline-block;
    width: 36px;
    height: 10px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--apex-accent-dim) 20%, transparent);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }
</style>
