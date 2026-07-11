<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import * as m from '$paraglide/messages';
  import { formatUsd, formatUsdWhole, formatNumber } from '$lib/utils/format';
  import { ApiRequestError } from '$lib/api/errors';
  import { PAY_CURRENCIES, computeSummary } from '$lib/api/billing';
  import {
    billingKeys,
    topUpOptionsQueryOptions,
    paymentProvidersQueryOptions,
    topUpStripeMutationOptions,
    topUpNowPaymentsMutationOptions,
  } from '$lib/queries/billing';

  const queryClient = useQueryClient();

  const optionsQuery = createQuery(() => topUpOptionsQueryOptions());
  const providersQuery = createQuery(() => paymentProvidersQueryOptions());
  const stripeMutation = createMutation(() => topUpStripeMutationOptions());
  const nowPaymentsMutation = createMutation(() => topUpNowPaymentsMutationOptions());

  let selectedPreset = $state<number | null>(null);
  let amountInput = $state('');
  let payCurrency = $state<string>(PAY_CURRENCIES[0].code);
  let errorMsg = $state('');
  let providerDisabledMsg = $state('');

  const options = $derived(optionsQuery.data);

  const presets = $derived.by(() => {
    if (!options) return [];
    const tiers = [...options.tiers].sort((a, b) => a.threshold_usd - b.threshold_usd);
    const cards = tiers.map((t) => ({ amount: t.threshold_usd, discountPct: t.discount_pct }));
    const firstThreshold = tiers[0]?.threshold_usd;
    if (firstThreshold === undefined || options.min_amount_usd < firstThreshold) {
      cards.unshift({ amount: options.min_amount_usd, discountPct: 0 });
    }
    return cards;
  });

  const amountUsd = $derived(amountInput === '' ? null : Number(amountInput));
  const isIntegerAmount = $derived(amountUsd !== null && Number.isInteger(amountUsd));

  const boundsError = $derived.by(() => {
    if (!options || amountUsd === null) return '';
    if (!isIntegerAmount) return m.billing_topup_amount_integer();
    if (amountUsd < options.min_amount_usd || amountUsd > options.max_amount_usd) {
      return m.billing_topup_amount_bounds({
        min: formatUsdWhole(options.min_amount_usd),
        max: formatUsdWhole(options.max_amount_usd),
      });
    }
    return '';
  });

  const isAmountValid = $derived(
    options !== undefined && amountUsd !== null && isIntegerAmount && boundsError === '',
  );

  const summary = $derived.by(() => {
    if (!options || !isAmountValid || amountUsd === null) return null;
    return computeSummary(options, amountUsd);
  });

  const isCheckingOut = $derived(stripeMutation.isPending || nowPaymentsMutation.isPending);

  function clearErrors() {
    errorMsg = '';
    providerDisabledMsg = '';
  }

  function selectPreset(amount: number) {
    selectedPreset = amount;
    amountInput = String(amount);
    clearErrors();
  }

  function onAmountInput(value: string) {
    amountInput = value.replace(/[^0-9]/g, '');
    const numeric = amountInput === '' ? null : Number(amountInput);
    selectedPreset = presets.some((p) => p.amount === numeric) ? numeric : null;
    clearErrors();
  }

  async function handleCheckout(provider: 'stripe' | 'nowpayments') {
    if (!isAmountValid || amountUsd === null) return;
    clearErrors();
    try {
      if (provider === 'stripe') {
        const result = await stripeMutation.mutateAsync({ amount_usd: amountUsd });
        window.location.assign(result.checkout_url);
      } else {
        const result = await nowPaymentsMutation.mutateAsync({
          amount_usd: amountUsd,
          pay_currency: payCurrency,
        });
        window.location.assign(result.invoice_url);
      }
    } catch (e) {
      if (e instanceof ApiRequestError && e.error === 'payment_provider_disabled') {
        providerDisabledMsg = m.billing_topup_provider_disabled();
        queryClient.invalidateQueries({ queryKey: billingKeys.paymentProviders() });
      } else {
        errorMsg = e instanceof ApiRequestError ? e.message : m.error_generic();
      }
    }
  }
</script>

<div class="flex flex-col gap-4">
  {#if optionsQuery.isPending}
    <div class="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <div class="h-20 animate-pulse rounded-xl bg-surface"></div>
      {/each}
    </div>
  {:else if optionsQuery.isError || !options}
    <div class="flex flex-col items-center gap-2 py-10 text-center">
      <p class="text-sm text-text-dim">{m.billing_topup_load_error()}</p>
      <button
        type="button"
        class="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-text-muted"
        onclick={() => optionsQuery.refetch()}
      >
        {m.common_retry()}
      </button>
    </div>
  {:else}
    <!-- Preset cards -->
    <div class="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {#each presets as preset (preset.amount)}
        <button
          type="button"
          onclick={() => selectPreset(preset.amount)}
          class="relative rounded-xl border p-3 text-left transition-colors {selectedPreset ===
          preset.amount
            ? 'border-accent bg-accent-glow'
            : 'border-border bg-surface hover:border-border-active'}"
        >
          <p class="font-mono text-lg font-extrabold text-text">{formatUsdWhole(preset.amount)}</p>
          <p class="mt-0.5 text-xs text-text-muted">
            ◈{formatNumber(preset.amount * options.tokens_per_usd)}
          </p>
          {#if preset.discountPct > 0}
            <span
              class="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-success bg-success/10"
            >
              -{preset.discountPct}%
            </span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- Free amount input -->
    <div>
      <label
        for="topup-amount"
        class="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted"
      >
        {m.billing_topup_amount_label()}
      </label>
      <input
        id="topup-amount"
        type="text"
        inputmode="numeric"
        placeholder={String(options.min_amount_usd)}
        value={amountInput}
        oninput={(e) => onAmountInput(e.currentTarget.value)}
        class="w-full rounded-xl border border-border bg-surface px-4 py-3 font-mono text-lg text-text focus:border-border-active focus:outline-none"
      />
      {#if boundsError}
        <p class="mt-1 text-xs text-danger">{boundsError}</p>
      {:else}
        <p class="mt-1 text-xs text-text-dim">
          {m.billing_topup_amount_hint({
            min: formatUsdWhole(options.min_amount_usd),
            max: formatUsdWhole(options.max_amount_usd),
          })}
        </p>
      {/if}
    </div>

    <!-- Live summary -->
    {#if summary && amountUsd !== null}
      <div
        class="rounded-xl border border-accent-dim/20 bg-linear-to-br from-accent-dim/10 to-surface p-4"
      >
        <p class="text-sm text-text">
          {m.billing_topup_summary_pay({ amount: formatUsd(amountUsd) })}
          <span class="mx-1 text-text-dim">→</span>
          {m.billing_topup_summary_receive({ tokens: formatNumber(summary.tokensGranted) })}
        </p>
        {#if summary.discountPct > 0}
          <p class="mt-1 text-xs font-semibold text-success">
            {m.billing_topup_summary_discount({ pct: summary.discountPct })}
          </p>
        {/if}
      </div>
    {/if}

    <!-- Provider CTAs -->
    {#if providersQuery.isPending}
      <div class="h-12 animate-pulse rounded-xl bg-surface"></div>
    {:else if (providersQuery.data ?? []).length === 0}
      <div class="rounded-xl border border-border bg-surface p-4 text-center text-sm text-text-dim">
        {m.billing_topup_providers_unavailable()}
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        {#each providersQuery.data ?? [] as p (p.provider)}
          {#if p.provider === 'stripe'}
            <button
              type="button"
              disabled={!isAmountValid || isCheckingOut}
              onclick={() => handleCheckout('stripe')}
              class="rounded-2.5 bg-[#635bff] py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {stripeMutation.isPending
                ? m.billing_topup_processing()
                : m.billing_topup_pay_stripe()}
            </button>
          {:else if p.provider === 'nowpayments'}
            <div class="flex gap-2">
              <select
                bind:value={payCurrency}
                disabled={isCheckingOut}
                aria-label={m.billing_topup_currency_label()}
                class="rounded-2.5 border border-border bg-surface px-3 py-3 text-sm text-text"
              >
                {#each PAY_CURRENCIES as c (c.code)}
                  <option value={c.code}>{c.label}</option>
                {/each}
              </select>
              <button
                type="button"
                disabled={!isAmountValid || isCheckingOut}
                onclick={() => handleCheckout('nowpayments')}
                class="flex-1 rounded-2.5 border border-border bg-transparent py-3 text-sm font-semibold text-text disabled:opacity-50"
              >
                {nowPaymentsMutation.isPending
                  ? m.billing_topup_processing()
                  : m.billing_topup_pay_crypto()}
              </button>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    {#if providerDisabledMsg}
      <p class="text-sm text-danger">{providerDisabledMsg}</p>
    {:else if errorMsg}
      <p class="text-sm text-danger">{errorMsg}</p>
    {/if}
  {/if}
</div>
