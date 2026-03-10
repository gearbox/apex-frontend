<script lang="ts">
  import { formatTokens, formatUsd } from '$lib/utils/format';

  let activeTab = $state<'overview' | 'buy' | 'history'>('overview');

  const packages = [
    { name: 'Starter', tokens: 500, price: '4.99', popular: false, bonus: 0 },
    { name: 'Creator', tokens: 1200, price: '9.99', popular: true, bonus: 10 },
    { name: 'Pro', tokens: 3000, price: '19.99', popular: false, bonus: 20 },
    { name: 'Studio', tokens: 8000, price: '49.99', popular: false, bonus: 30 },
  ];
</script>

<svelte:head>
  <title>Billing — Apex</title>
</svelte:head>

<div class="mx-auto max-w-4xl p-4 md:p-6">
  <h1 class="mb-4 text-xl font-semibold text-text">Billing & Tokens</h1>

  <!-- Tabs -->
  <div class="mb-6 flex gap-1 rounded-lg border border-border bg-bg p-1">
    {#each [
      { key: 'overview', label: 'Overview' },
      { key: 'buy', label: 'Buy Tokens' },
      { key: 'history', label: 'History' },
    ] as tab}
      <button
        onclick={() => (activeTab = tab.key as typeof activeTab)}
        class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all {activeTab === tab.key
          ? 'bg-surface text-text shadow-sm'
          : 'text-text-dim hover:text-text-muted'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if activeTab === 'overview'}
    <!-- Balance card -->
    <div class="rounded-xl border border-border bg-surface p-6">
      <p class="text-sm text-text-muted">Token Balance</p>
      <p class="mt-1 text-3xl font-bold text-accent">{formatTokens(0)}</p>
      <div class="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
        <div>
          <span class="text-text-dim">Account</span>
          <p class="font-medium text-text">Personal</p>
        </div>
        <div>
          <span class="text-text-dim">Monthly Spend</span>
          <p class="font-medium text-text">{formatTokens(0)}</p>
        </div>
        <div>
          <span class="text-text-dim">Generations</span>
          <p class="font-medium text-text">0</p>
        </div>
      </div>
    </div>

    <!-- Cost reference -->
    <div class="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
      {#each [
        { model: 'Grok Imagine', icon: '✦', cost: 5 },
        { model: 'Grok 2', icon: '◈', cost: 8 },
        { model: 'Grok Video', icon: '▶', cost: 25 },
      ] as item}
        <div class="rounded-xl border border-border bg-surface p-4 text-center">
          <span class="text-lg">{item.icon}</span>
          <p class="mt-1 text-sm font-medium text-text">{item.model}</p>
          <p class="text-xs text-text-muted">{formatTokens(item.cost)} / generation</p>
        </div>
      {/each}
    </div>
  {:else if activeTab === 'buy'}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      {#each packages as pkg}
        <div
          class="relative rounded-xl border bg-surface p-5 transition-colors {pkg.popular
            ? 'border-accent'
            : 'border-border hover:border-border-active'}"
        >
          {#if pkg.popular}
            <span class="absolute -top-2.5 right-3 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">
              POPULAR
            </span>
          {/if}
          <h3 class="text-lg font-semibold text-text">{pkg.name}</h3>
          <p class="mt-1 text-2xl font-bold text-accent">{formatUsd(pkg.price)}</p>
          <p class="mt-1 text-sm text-text-muted">
            {pkg.tokens.toLocaleString()} tokens
            {#if pkg.bonus > 0}
              <span class="text-success">+{pkg.bonus}% bonus</span>
            {/if}
          </p>
          <button
            class="mt-4 w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            disabled
          >
            Purchase
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-16">
      <p class="text-sm text-text-dim">No transactions yet</p>
    </div>
  {/if}
</div>
