<script lang="ts">
  import { formatUsd } from '$lib/utils/format';

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
      class="mb-5 rounded-2xl border border-accent-dim/20 bg-gradient-to-br from-accent-dim/10 to-surface p-5 md:p-7"
    >
      <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-text-muted">
        Token Balance
      </p>
      <div class="flex items-baseline gap-2">
        <span class="font-mono text-[32px] font-extrabold leading-none text-text md:text-[42px]">
          0
        </span>
        <span class="text-sm text-text-muted">tokens</span>
      </div>
      <div class="mt-3.5 flex flex-wrap gap-4">
        <div>
          <p class="mb-0.5 text-[10px] text-text-dim">Account</p>
          <p class="text-xs font-semibold text-text">Personal</p>
        </div>
        <div>
          <p class="mb-0.5 text-[10px] text-text-dim">This Month</p>
          <p class="font-mono text-xs font-semibold text-danger">-0</p>
        </div>
        <div>
          <p class="mb-0.5 text-[10px] text-text-dim">Generations</p>
          <p class="font-mono text-xs font-semibold text-text">0</p>
        </div>
      </div>
    </div>

    <!-- Cost per Generation -->
    <p class="mb-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
      Cost per Generation
    </p>
    <div class="grid grid-cols-3 gap-2">
      {#each [
        { label: 'Imagine', icon: '✦', cost: 5 },
        { label: 'Grok 2', icon: '◈', cost: 8 },
        { label: 'Video', icon: '▶', cost: 25 },
      ] as item (item.label)}
        <div class="rounded-[10px] border border-border bg-surface p-3 md:p-4">
          <span class="text-lg">{item.icon}</span>
          <p class="mt-1.5 text-[11px] font-semibold text-text">{item.label}</p>
          <p class="font-mono text-base font-extrabold text-accent">◈{item.cost}</p>
        </div>
      {/each}
    </div>

  {:else if activeTab === 'buy'}
    <div class="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      {#each packages as pkg (pkg.name)}
        <div
          class="relative cursor-pointer rounded-xl border p-4 transition-colors {pkg.popular
            ? 'border-accent-dim bg-gradient-to-br from-accent-dim/8 to-surface'
            : 'border-border bg-surface hover:border-border-active'}"
        >
          {#if pkg.popular}
            <span
              class="absolute -top-2 right-3 rounded-md bg-gradient-to-r from-accent-dim to-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
            >
              Popular
            </span>
          {/if}
          <div class="flex items-baseline justify-between">
            <p class="text-sm font-bold text-text">{pkg.name}</p>
            <p class="font-mono text-[22px] font-extrabold text-text">{formatUsd(pkg.price)}</p>
          </div>
          <div class="mt-1 flex items-center gap-2">
            <span class="font-mono text-xs font-semibold text-accent">◈{pkg.tokens.toLocaleString()}</span>
            {#if pkg.bonus > 0}
              <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold text-success bg-success/10">
                +{pkg.bonus}%
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-4 flex gap-2">
      <button
        class="flex-1 rounded-[10px] bg-[#635bff] py-3 text-sm font-bold text-white"
        disabled
      >
        Stripe
      </button>
      <button
        class="flex-1 rounded-[10px] border border-border bg-transparent py-3 text-sm font-semibold text-text"
        disabled
      >
        Crypto
      </button>
    </div>

  {:else}
    <div class="flex flex-col items-center justify-center py-16">
      <p class="text-sm text-text-dim">No transactions yet</p>
    </div>
  {/if}
</div>
