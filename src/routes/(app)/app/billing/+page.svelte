<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { page } from '$app/stores';
  import * as m from '$paraglide/messages';
  import { formatNumber } from '$lib/utils/format';
  import apiClient from '$lib/api/client';
  import { productInfo } from '$lib/stores/product';
  import { currentUser } from '$lib/stores/auth';
  import { isSSEConnected } from '$lib/stores/eventStream';
  import TopUpPanel from '$lib/components/billing/TopUpPanel.svelte';
  import CursorPagination from '$lib/components/shared/CursorPagination.svelte';
  import { CursorPaginator } from '$lib/utils/cursorPagination.svelte';
  import {
    billingBalanceQueryOptions,
    billingTransactionsQueryOptions,
  } from '$lib/queries/billing';
  import {
    getPendingPayments,
    hasPaymentsAwaitingReconciliation,
    markPendingPaymentReturned,
    type PendingPaymentScope,
  } from '$lib/stores/pendingPayments';

  const PAGE_SIZE = 20;
  const pager = new CursorPaginator();
  let activeTab = $state<'overview' | 'buy' | 'history'>('overview');
  let handledReturn = $state('');

  const pendingScope = $derived<PendingPaymentScope | null>(
    $currentUser
      ? {
          userId: $currentUser.id,
          product: $productInfo?.product ?? window.location.host,
        }
      : null,
  );
  const pendingPaymentIds = $derived.by(() => {
    return pendingScope ? getPendingPayments(pendingScope).map((record) => record.paymentId) : [];
  });
  const hasRecentPendingPayments = $derived.by(() => {
    return pendingScope ? hasPaymentsAwaitingReconciliation(pendingScope) : false;
  });
  const returnOutcome = $derived(
    $page.url.searchParams.get('success') === 'true'
      ? 'success'
      : $page.url.searchParams.get('cancelled') === 'true'
        ? 'cancelled'
        : null,
  );
  const balancePollingInterval = $derived($isSSEConnected ? false : 30_000);
  const transactionPollingInterval = $derived(
    !$isSSEConnected && hasRecentPendingPayments ? 30_000 : false,
  );

  const balanceQuery = createQuery(() => billingBalanceQueryOptions(balancePollingInterval));
  const pricingQuery = createQuery(() => ({
    queryKey: ['pricing'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/v1/billing/pricing');
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  }));
  const transactionsQuery = createQuery(() =>
    billingTransactionsQueryOptions(
      { limit: PAGE_SIZE, ...pager.param },
      transactionPollingInterval,
    ),
  );

  $effect(() => {
    if (!returnOutcome || !pendingScope) return;
    const key = `${returnOutcome}:${pendingScope.userId}:${pendingScope.product}`;
    if (handledReturn === key) return;
    handledReturn = key;

    if (returnOutcome === 'success') {
      // Stripe returns no payment metadata. Mark all current Stripe attempts as returned;
      // settlement is still determined solely by a later transaction payment_id match.
      for (const record of getPendingPayments(pendingScope)) {
        if (record.provider === 'stripe')
          markPendingPaymentReturned(pendingScope, record.paymentId);
      }
    }
  });

  const costRows = $derived(
    (pricingQuery.data ?? [])
      .filter(
        (row: { is_active: boolean; provider: string }) => row.is_active && row.provider === 'grok',
      )
      .slice(0, 6),
  );
  const MODEL_META: Record<string, { icon: string; label: string }> = {
    'grok-imagine-image': { icon: '✦', label: 'Grok Imagine' },
    'grok-2-image-1212': { icon: '◈', label: 'Grok 2' },
    'grok-imagine-video': { icon: '▶', label: 'Grok Video' },
    t2i: { icon: '✦', label: 'Text → Image' },
    t2v: { icon: '▶', label: 'Text → Video' },
    i2i: { icon: '◈', label: 'Image → Image' },
    i2v: { icon: '▶', label: 'Image → Video' },
  };
  const FALLBACK_COSTS = [
    { label: 'Imagine', icon: '✦', cost: 5 },
    { label: 'Grok 2', icon: '◈', cost: 8 },
    { label: 'Video', icon: '▶', cost: 25 },
  ];
  const appTitle = $derived($productInfo?.display_name ?? 'Apex');

  function truncatePaymentId(paymentId: string): string {
    return `${paymentId.slice(0, 8)}…`;
  }
</script>

<svelte:head>
  <title>Billing — {appTitle}</title>
</svelte:head>

<div class="p-4 md:p-0">
  {#if returnOutcome === 'success'}
    <div
      class="mb-4 rounded-xl border border-accent-dim/30 bg-accent-glow p-3 text-sm text-text"
      role="status"
    >
      {pendingPaymentIds.length > 0
        ? m.billing_return_success()
        : m.billing_return_success_generic()}
    </div>
  {:else if returnOutcome === 'cancelled'}
    <div
      class="mb-4 rounded-xl border border-border bg-surface p-3 text-sm text-text-muted"
      role="status"
    >
      {m.billing_return_cancelled()}
    </div>
  {/if}

  <div class="-mb-px mb-5 flex gap-1 overflow-x-auto border-b border-border">
    {#each [{ key: 'overview', label: 'Overview' }, { key: 'buy', label: 'Buy Tokens' }, { key: 'history', label: 'History' }] as tab (tab.key)}
      <button
        onclick={() => (activeTab = tab.key as typeof activeTab)}
        class="whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-all {activeTab ===
        tab.key
          ? 'border-accent font-semibold text-accent'
          : 'border-transparent text-text-muted hover:text-text'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if activeTab === 'overview'}
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
            {balanceQuery.data?.balance !== undefined
              ? formatNumber(balanceQuery.data.balance)
              : '0'}
          </span>
          <span class="text-sm text-text-muted">tokens</span>
        {/if}
      </div>
      <div class="mt-3.5 flex flex-wrap gap-4">
        <div>
          <p class="mb-0.5 text-[10px] text-text-dim">Account</p>
          <p class="text-xs font-semibold capitalize text-text">
            {balanceQuery.data?.account_type ?? 'Personal'}
          </p>
        </div>
        {#if balanceQuery.data?.organization_name}
          <div>
            <p class="mb-0.5 text-[10px] text-text-dim">Organization</p>
            <p class="text-xs font-semibold text-text">{balanceQuery.data.organization_name}</p>
          </div>
        {/if}
      </div>
    </div>

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
    <TopUpPanel />
  {:else if transactionsQuery.isLoading}
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
      {#each transactionsQuery.data?.items ?? [] as tx (tx.id)}
        <div class="flex items-center justify-between py-3">
          <div>
            <p class="text-xs font-medium capitalize text-text">
              {tx.transaction_type.replace('_', ' ')}
            </p>
            {#if tx.description}
              <p class="text-[11px] text-text-dim">{tx.description}</p>
            {/if}
            {#if tx.payment_id}
              <p class="text-[10px] text-text-dim">
                {m.billing_transaction_receipt({ paymentId: truncatePaymentId(tx.payment_id) })}
              </p>
            {/if}
          </div>
          <div class="text-right">
            <p
              class="font-mono text-xs font-semibold {tx.amount >= 0
                ? 'text-success'
                : 'text-danger'}"
            >
              {tx.amount >= 0 ? '+' : ''}◈{Math.abs(tx.amount)}
            </p>
            <p class="font-mono text-[10px] text-text-dim">bal: ◈{tx.balance_after}</p>
          </div>
        </div>
      {/each}
    </div>
    <CursorPagination
      hasPrev={pager.hasPrev}
      hasNext={transactionsQuery.data?.has_more === true &&
        Boolean(transactionsQuery.data.next_cursor)}
      pageNumber={pager.pageNumber}
      loading={transactionsQuery.isFetching}
      onprev={() => pager.prev()}
      onnext={() => pager.next(transactionsQuery.data?.next_cursor)}
    />
  {/if}
</div>
