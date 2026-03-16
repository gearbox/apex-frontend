<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import apiClient from '$lib/api/client';
  import { formatUsd, formatNumber } from '$lib/utils/format';
  import { productInfo } from '$lib/stores/product';

  let activeTab = $state<'overview' | 'buy' | 'history'>('overview');

  const balanceQuery = createQuery(() => ({
    queryKey: ['balance'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/v1/billing/balance');
      return data ?? null;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  }));

  const pricingQuery = createQuery(() => ({
    queryKey: ['pricing'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/v1/billing/pricing');
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  }));

  const packagesQuery = createQuery(() => ({
    queryKey: ['packages'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/v1/billing/packages');
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  }));

  const transactionsQuery = createQuery(() => ({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/v1/billing/transactions', {
        params: { query: { limit: 20, offset: 0 } },
      });
      return data ?? { items: [], total: 0 };
    },
    staleTime: 60_000,
  }));

  // Cost reference rows derived from pricing rules
  const costRows = $derived(
    (pricingQuery.data ?? [])
      .filter((r) => r.is_active && r.provider === 'grok')
      .slice(0, 6),
  );

  const MODEL_META: Record<string, { icon: string; label: string }> = {
    'grok-imagine-image': { icon: '✦', label: 'Grok Imagine' },
    'grok-2-image-1212': { icon: '◈', label: 'Grok 2' },
    'grok-imagine-video': { icon: '▶', label: 'Grok Video' },
    't2i': { icon: '✦', label: 'Text → Image' },
    't2v': { icon: '▶', label: 'Text → Video' },
    'i2i': { icon: '◈', label: 'Image → Image' },
    'i2v': { icon: '▶', label: 'Image → Video' },
  };

  // Payment provider availability from product info (default true when not yet loaded)
  let hasStripe = $derived($productInfo?.payment_providers.includes('stripe') ?? true);
  let hasCrypto = $derived($productInfo?.payment_providers.includes('nowpayments') ?? true);

  const FALLBACK_COSTS = [
    { label: 'Imagine', icon: '✦', cost: 5 },
    { label: 'Grok 2', icon: '◈', cost: 8 },
    { label: 'Video', icon: '▶', cost: 25 },
  ];
</script>

<svelte:head>
  <title>Billing — Apex</title>
</svelte:head>

<div class="p-4 md:p-0">
  <!-- Tabs — underline style -->
  <div class="-mb-px mb-5 flex gap-1 overflow-x-auto border-b border-border">
    {#each [
      { key: 'overview', label: 'Overview' },
      { key: 'buy', label: 'Buy Tokens' },
      { key: 'history', label: 'History' },
    ] as tab (tab.key)}
      <button
        onclick={() => (activeTab = tab.key as typeof activeTab)}
        class="whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-all {activeTab === tab.key
          ? 'border-accent font-semibold text-accent'
          : 'border-transparent text-text-muted hover:text-text'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if activeTab === 'overview'}
    <!-- TOKEN BALANCE gradient panel -->
    <div
      class="mb-5 rounded-2xl border border-accent-dim/20 bg-linear-to-br from-accent-dim/10 to-surface p-5 md:p-7"
    >
      <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-text-muted">
        Token Balance
      </p>
      <div class="flex items-baseline gap-2">
        {#if balanceQuery.isLoading}
          <div class="h-10 w-28 animate-pulse rounded-lg bg-surface-hover"></div>
        {:else}
          <span class="font-mono text-[32px] font-extrabold leading-none text-text md:text-[42px]">
            {balanceQuery.data?.balance !== undefined ? formatNumber(balanceQuery.data.balance) : '0'}
          </span>
          <span class="text-sm text-text-muted">tokens</span>
        {/if}
      </div>
      <div class="mt-3.5 flex flex-wrap gap-4">
        <div>
          <p class="mb-0.5 text-[10px] text-text-dim">Account</p>
          <p class="text-xs font-semibold capitalize text-text">{balanceQuery.data?.account_type ?? 'Personal'}</p>
        </div>
        {#if balanceQuery.data?.organization_name}
          <div>
            <p class="mb-0.5 text-[10px] text-text-dim">Organization</p>
            <p class="text-xs font-semibold text-text">{balanceQuery.data.organization_name}</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Cost per Generation -->
    <p class="mb-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
      Cost per Generation
    </p>
    <div class="grid grid-cols-3 gap-2">
      {#if costRows.length > 0}
        {#each costRows as row (row.id)}
          {@const metaKey = row.model ?? row.generation_type}
          {@const meta = MODEL_META[metaKey] ?? { icon: '◆', label: metaKey }}
          <div class="rounded-2.5 border border-border bg-surface p-3 md:p-4">
            <span class="text-lg">{meta.icon}</span>
            <p class="mt-1.5 text-[11px] font-semibold text-text">{meta.label}</p>
            <p class="font-mono text-base font-extrabold text-accent">◈{row.token_cost}</p>
          </div>
        {/each}
      {:else}
        {#each FALLBACK_COSTS as item (item.label)}
          <div class="rounded-2.5 border border-border bg-surface p-3 md:p-4">
            <span class="text-lg">{item.icon}</span>
            <p class="mt-1.5 text-[11px] font-semibold text-text">{item.label}</p>
            <p class="font-mono text-base font-extrabold text-accent">◈{item.cost}</p>
          </div>
        {/each}
      {/if}
    </div>

  {:else if activeTab === 'buy'}
    {#if packagesQuery.isLoading}
      <div class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {#each Array(4) as _, i (i)}
          <div class="h-24 animate-pulse rounded-xl bg-surface"></div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {#each (packagesQuery.data ?? []) as pkg (pkg.id)}
          <div class="relative cursor-pointer rounded-xl border p-4 transition-colors border-border bg-surface hover:border-border-active">
            <div class="flex items-baseline justify-between">
              <p class="text-sm font-bold text-text">{pkg.name}</p>
              <p class="font-mono text-[22px] font-extrabold text-text">{formatUsd(pkg.price_usd)}</p>
            </div>
            <div class="mt-1 flex items-center gap-2">
              <span class="font-mono text-xs font-semibold text-accent">◈{formatNumber(pkg.total_tokens)}</span>
              {#if pkg.bonus_tokens > 0}
                <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold text-success bg-success/10">
                  +{Math.round((pkg.bonus_tokens / pkg.tokens) * 100)}%
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
    {#if hasStripe || hasCrypto}
      <div class="mt-4 flex gap-2">
        {#if hasStripe}
          <button class="flex-1 rounded-2.5 bg-[#635bff] py-3 text-sm font-bold text-white" disabled>
            Stripe
          </button>
        {/if}
        {#if hasCrypto}
          <button class="flex-1 rounded-2.5 border border-border bg-transparent py-3 text-sm font-semibold text-text" disabled>
            Crypto
          </button>
        {/if}
      </div>
    {/if}

  {:else}
    {#if transactionsQuery.isLoading}
      <div class="flex flex-col gap-2">
        {#each Array(5) as _, i (i)}
          <div class="h-12 animate-pulse rounded-lg bg-surface"></div>
        {/each}
      </div>
    {:else if (transactionsQuery.data?.items ?? []).length === 0}
      <div class="flex flex-col items-center justify-center py-16">
        <p class="text-sm text-text-dim">No transactions yet</p>
      </div>
    {:else}
      <div class="flex flex-col divide-y divide-border">
        {#each (transactionsQuery.data?.items ?? []) as tx (tx.id)}
          <div class="flex items-center justify-between py-3">
            <div>
              <p class="text-xs font-medium capitalize text-text">{tx.transaction_type.replace('_', ' ')}</p>
              {#if tx.description}
                <p class="text-[11px] text-text-dim">{tx.description}</p>
              {/if}
            </div>
            <div class="text-right">
              <p class="font-mono text-xs font-semibold {tx.amount >= 0 ? 'text-success' : 'text-danger'}">
                {tx.amount >= 0 ? '+' : ''}◈{Math.abs(tx.amount)}
              </p>
              <p class="font-mono text-[10px] text-text-dim">bal: ◈{tx.balance_after}</p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
