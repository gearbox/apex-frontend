<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import * as m from '$paraglide/messages';
  import { formatUsd, formatUsdWhole, formatNumber } from '$lib/utils/format';
  import { ApiRequestError } from '$lib/api/errors';
  import {
    computeSummary,
    type TopUpNowPaymentsRequest,
    type TopUpStripeRequest,
  } from '$lib/api/billing';
  import {
    billingKeys,
    paymentCurrenciesQueryOptions,
    paymentProvidersQueryOptions,
    topUpNowPaymentsMutationOptions,
    topUpOptionsQueryOptions,
    topUpStripeMutationOptions,
    createTopUpIntent,
    type TopUpIntent,
  } from '$lib/queries/billing';
  import { currentUser } from '$lib/stores/auth';
  import { productInfo } from '$lib/stores/product';
  import { getPaymentStorageScope } from '$lib/stores/paymentScope';
  import { savePendingPayment } from '$lib/stores/pendingPayments';
  import {
    clearCheckoutIntent,
    getCheckoutIntent,
    saveCheckoutIntent,
    saveStripeReturnPointer,
    type PersistedCheckoutIntent,
  } from '$lib/stores/checkoutIntents';
  import PaymentCurrencyPicker from './PaymentCurrencyPicker.svelte';

  type CheckoutIntent =
    | ({ provider: 'stripe' } & TopUpIntent<TopUpStripeRequest>)
    | ({ provider: 'nowpayments' } & TopUpIntent<TopUpNowPaymentsRequest>);

  const queryClient = useQueryClient();
  const optionsQuery = createQuery(() => topUpOptionsQueryOptions());
  const providersQuery = createQuery(() => paymentProvidersQueryOptions());
  const currenciesQuery = createQuery(() => paymentCurrenciesQueryOptions());
  const stripeMutation = createMutation(() => topUpStripeMutationOptions());
  const nowPaymentsMutation = createMutation(() => topUpNowPaymentsMutationOptions());

  let selectedPreset = $state<number | null>(null);
  let amountInput = $state('');
  let selectedTicker = $state<string | null>(null);
  let activeIntent = $state<CheckoutIntent | null>(null);
  let retryIntent = $state<CheckoutIntent | null>(null);
  let errorMsg = $state('');
  let providerDisabledMsg = $state('');
  let observedTicker = $state<string | null | undefined>(undefined);
  let restoredScopeKey = $state('');
  let formTouched = $state(false);
  let retryLocallyDiscarded = $state(false);
  let retryAvailableAt = $state(0);
  let retryClock = $state(Date.now());
  let retryDelayTimer: ReturnType<typeof setTimeout> | undefined;

  const options = $derived(optionsQuery.data);
  const currencies = $derived(currenciesQuery.data ?? []);
  const paymentScope = $derived(getPaymentStorageScope($currentUser, $productInfo));
  const supportedProviders = $derived(
    (providersQuery.data ?? []).filter((provider) =>
      isSupportedProvider(String(provider.provider)),
    ),
  );

  const presets = $derived.by(() => {
    if (!options) return [];
    const tiers = [...options.tiers].sort((a, b) => a.threshold_usd - b.threshold_usd);
    return tiers.map((tier) => ({
      amount: tier.threshold_usd,
      discountPct: tier.discount_pct,
    }));
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
  const isCheckingOut = $derived(
    activeIntent !== null || stripeMutation.isPending || nowPaymentsMutation.isPending,
  );
  const isCheckoutLocked = $derived(isCheckingOut || retryIntent !== null);
  const retryWaiting = $derived(retryAvailableAt > retryClock);

  // A selected ticker may only be echoed from the currently loaded catalog.
  $effect(() => {
    if (selectedTicker && !currencies.some((currency) => currency.ticker === selectedTicker)) {
      selectedTicker = null;
    }
  });

  $effect(() => {
    if (observedTicker !== undefined && observedTicker !== selectedTicker) markFormTouched();
    observedTicker = selectedTicker;
  });

  $effect(() => {
    const scope = paymentScope;
    const scopeKey = scope ? `${scope.userId}:${scope.product}` : '';
    if (!scope || restoredScopeKey === scopeKey) return;
    restoredScopeKey = scopeKey;
    if (formTouched || retryLocallyDiscarded) {
      clearCheckoutIntent(scope);
      return;
    }
    const stored = getCheckoutIntent(scope);
    if (stored) retryIntent = toCheckoutIntent(stored);
  });

  function isSupportedProvider(provider: string): provider is 'stripe' | 'nowpayments' {
    // Adapter branches are intentional. Availability itself comes only from the API response.
    return provider === 'stripe' || provider === 'nowpayments';
  }

  function clearErrors(): void {
    errorMsg = '';
    providerDisabledMsg = '';
  }

  function selectPreset(amount: number): void {
    if (amountInput !== String(amount)) markFormTouched();
    selectedPreset = amount;
    amountInput = String(amount);
    clearErrors();
  }

  function onAmountInput(value: string): void {
    const nextValue = value.replace(/[^0-9]/g, '');
    if (nextValue !== amountInput) markFormTouched();
    amountInput = nextValue;
    const numeric = amountInput === '' ? null : Number(amountInput);
    selectedPreset = presets.some((preset) => preset.amount === numeric) ? numeric : null;
    clearErrors();
  }

  function createIntent(provider: 'stripe' | 'nowpayments'): CheckoutIntent | null {
    if (!isAmountValid || amountUsd === null) return null;
    if (provider === 'stripe') {
      return { provider, ...createTopUpIntent({ amount_usd: amountUsd }) };
    }

    // Do not spread UI state into this body: the backend forbids unknown fields.
    const body: TopUpNowPaymentsRequest = selectedTicker
      ? { amount_usd: amountUsd, pay_currency: selectedTicker }
      : { amount_usd: amountUsd };
    return { provider, ...createTopUpIntent(body) };
  }

  function toCheckoutIntent(intent: PersistedCheckoutIntent): CheckoutIntent {
    return intent.provider === 'stripe'
      ? { provider: 'stripe', body: intent.body, idempotencyKey: intent.idempotencyKey }
      : { provider: 'nowpayments', body: intent.body, idempotencyKey: intent.idempotencyKey };
  }

  function stopRetryDelay(): void {
    if (retryDelayTimer) clearTimeout(retryDelayTimer);
    retryDelayTimer = undefined;
    retryAvailableAt = 0;
    retryClock = Date.now();
  }

  function clearRetryIntent(): void {
    retryIntent = null;
    stopRetryDelay();
    if (paymentScope) clearCheckoutIntent(paymentScope);
  }

  function markFormTouched(): void {
    formTouched = true;
    clearRetryIntent();
  }

  function discardRetryIntent(): void {
    retryLocallyDiscarded = true;
    clearRetryIntent();
    clearErrors();
  }

  function delayRetry(seconds: number | undefined): void {
    stopRetryDelay();
    const delayMs = Math.max(0, seconds ?? 0) * 1000;
    if (delayMs === 0) return;
    retryAvailableAt = Date.now() + delayMs;
    retryClock = Date.now();
    retryDelayTimer = setTimeout(() => {
      retryClock = Date.now();
      retryDelayTimer = undefined;
    }, delayMs);
  }

  function persistRetryIntent(intent: CheckoutIntent): void {
    if (!paymentScope) return;
    saveCheckoutIntent(paymentScope, {
      provider: intent.provider,
      body: intent.body,
      idempotencyKey: intent.idempotencyKey,
      createdAt: new Date().toISOString(),
      retryable: true,
    });
  }

  function persistPendingPayment(intent: CheckoutIntent, paymentId: string): void {
    if (!paymentScope) return;

    savePendingPayment(paymentScope, {
      paymentId,
      provider: intent.provider,
      amountUsd: intent.body.amount_usd,
      ...(intent.provider === 'nowpayments' && intent.body.pay_currency
        ? { payCurrency: intent.body.pay_currency }
        : {}),
      createdAt: new Date().toISOString(),
      state: 'created',
    });
    if (intent.provider === 'stripe') saveStripeReturnPointer(paymentScope, paymentId);
  }

  function isRetryable(error: unknown): boolean {
    if (!(error instanceof ApiRequestError)) return true;
    return error.status_code >= 500 || error.status_code === 0;
  }

  async function submitIntent(intent: CheckoutIntent): Promise<void> {
    activeIntent = intent;
    clearErrors();
    // Persist before dispatch: a lost response must never force a fresh key after reload.
    persistRetryIntent(intent);
    try {
      if (intent.provider === 'stripe') {
        const result = await stripeMutation.mutateAsync(intent);
        persistPendingPayment(intent, result.payment_id);
        window.location.assign(result.checkout_url);
      } else {
        const result = await nowPaymentsMutation.mutateAsync(intent);
        persistPendingPayment(intent, result.payment_id);
        window.location.assign(result.invoice_url);
      }
      clearRetryIntent();
    } catch (error) {
      if (error instanceof ApiRequestError && error.error === 'payment_provider_disabled') {
        clearRetryIntent();
        providerDisabledMsg = m.billing_topup_provider_disabled();
        await queryClient.invalidateQueries({ queryKey: billingKeys.paymentProviders() });
      } else if (error instanceof ApiRequestError && error.error === 'idempotency_conflict') {
        // A 409 can mean the exact request is still processing. Keep the immutable
        // key/body pair until an explicit retry or discard.
        retryIntent = intent;
        delayRetry(error.retry_after_seconds);
        errorMsg = m.billing_topup_still_processing();
      } else if (error instanceof ApiRequestError && error.error === 'pay_currency_suppressed') {
        clearRetryIntent();
        const rejectedTicker = error.pay_currency;
        selectedTicker = null;
        if (rejectedTicker) {
          queryClient.setQueryData(
            billingKeys.currencies(),
            (current: typeof currencies | undefined) =>
              current?.filter((currency) => currency.ticker !== rejectedTicker),
          );
        }
        await queryClient.invalidateQueries({ queryKey: billingKeys.currencies() });
        errorMsg = m.billing_topup_currency_suppressed();
      } else if (isRetryable(error)) {
        // Retrying preserves the exact UUID and body snapshot for this intent.
        retryIntent = intent;
        errorMsg = error instanceof ApiRequestError ? error.message : m.error_generic();
      } else {
        clearRetryIntent();
        errorMsg = error instanceof ApiRequestError ? error.message : m.error_generic();
      }
    } finally {
      activeIntent = null;
    }
  }

  function handleCheckout(provider: 'stripe' | 'nowpayments'): void {
    if (isCheckoutLocked) return;
    // Normal Pay is always a new deliberate intent; only the explicit retry reuses one.
    clearRetryIntent();
    const intent = createIntent(provider);
    if (intent) void submitIntent(intent);
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
    <div class="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {#each presets as preset (preset.amount)}
        <button
          type="button"
          aria-label={formatUsdWhole(preset.amount)}
          disabled={isCheckoutLocked}
          onclick={() => selectPreset(preset.amount)}
          class="relative rounded-xl border p-3 text-left transition-colors {selectedPreset ===
          preset.amount
            ? 'border-accent bg-accent-glow'
            : 'border-border bg-surface hover:border-border-active'} disabled:opacity-50"
        >
          <p class="font-mono text-lg font-extrabold text-text">{formatUsdWhole(preset.amount)}</p>
          <p class="mt-0.5 text-xs text-text-muted">
            ◈{formatNumber(preset.amount * options.tokens_per_usd)}
          </p>
          {#if preset.discountPct > 0}
            <span
              class="absolute right-2 top-2 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success"
            >
              -{preset.discountPct}%
            </span>
          {/if}
        </button>
      {/each}
    </div>

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
        disabled={isCheckoutLocked}
        oninput={(event) => onAmountInput(event.currentTarget.value)}
        class="w-full rounded-xl border border-border bg-surface px-4 py-3 font-mono text-lg text-text focus:border-border-active focus:outline-none disabled:opacity-50"
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

    {#if summary && amountUsd !== null}
      <div
        class="rounded-xl border border-accent-dim/20 bg-linear-to-br from-accent-dim/10 to-surface p-4"
      >
        <p class="text-sm text-text">
          {m.billing_topup_summary_pay({ amount: formatUsd(summary.amountCharged) })}
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

    {#if providersQuery.isPending}
      <div class="h-12 animate-pulse rounded-xl bg-surface"></div>
    {:else if providersQuery.isError}
      <div
        class="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-center text-sm text-text-dim"
      >
        <p>{m.billing_topup_load_error()}</p>
        <button
          type="button"
          class="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-muted"
          onclick={() => providersQuery.refetch()}
        >
          {m.common_retry()}
        </button>
      </div>
    {:else if supportedProviders.length === 0}
      <div class="rounded-xl border border-border bg-surface p-4 text-center text-sm text-text-dim">
        {m.billing_topup_providers_unavailable()}
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each supportedProviders as paymentProvider (paymentProvider.provider)}
          {#if String(paymentProvider.provider) === 'stripe'}
            <button
              type="button"
              disabled={!isAmountValid || isCheckoutLocked}
              onclick={() => handleCheckout('stripe')}
              class="rounded-2.5 bg-accent py-3 text-sm font-bold text-on-accent disabled:opacity-50"
            >
              {activeIntent?.provider === 'stripe'
                ? m.billing_topup_processing()
                : m.billing_topup_pay_stripe()}
            </button>
          {:else if String(paymentProvider.provider) === 'nowpayments'}
            {#if currencies.length > 0}
              <PaymentCurrencyPicker
                bind:value={selectedTicker}
                {currencies}
                disabled={isCheckoutLocked}
              />
            {/if}
            <button
              type="button"
              disabled={!isAmountValid || isCheckoutLocked}
              onclick={() => handleCheckout('nowpayments')}
              class="rounded-2.5 border border-border bg-transparent py-3 text-sm font-semibold text-text disabled:opacity-50"
            >
              {activeIntent?.provider === 'nowpayments'
                ? m.billing_topup_processing()
                : m.billing_topup_pay_crypto()}
            </button>
          {/if}
        {/each}
      </div>
    {/if}

    {#if retryIntent}
      <section
        class="rounded-xl border border-border bg-surface p-4"
        aria-label={m.billing_topup_recovery_title()}
      >
        <p class="text-sm font-semibold text-text">{m.billing_topup_recovery_title()}</p>
        <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt class="text-text-dim">{m.billing_topup_recovery_provider()}</dt>
          <dd class="text-text">{retryIntent.provider === 'stripe' ? 'Stripe' : 'NowPayments'}</dd>
          <dt class="text-text-dim">{m.billing_topup_recovery_credits()}</dt>
          <dd class="text-text">{formatUsdWhole(retryIntent.body.amount_usd)}</dd>
          {#if retryIntent.provider === 'nowpayments'}
            <dt class="text-text-dim">{m.billing_topup_recovery_currency()}</dt>
            <dd class="font-mono text-text">
              {retryIntent.body.pay_currency ?? m.billing_currency_picker_other()}
            </dd>
          {/if}
        </dl>
        <p class="mt-3 text-xs text-text-muted">{m.billing_topup_recovery_hint()}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isCheckingOut || retryWaiting}
            class="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text disabled:opacity-50"
            onclick={() => void submitIntent(retryIntent!)}
          >
            {retryWaiting ? m.billing_topup_retry_waiting() : m.billing_topup_retry_same()}
          </button>
          <button
            type="button"
            disabled={isCheckingOut}
            class="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-muted disabled:opacity-50"
            onclick={discardRetryIntent}
          >
            {m.billing_topup_discard_attempt()}
          </button>
        </div>
      </section>
    {/if}

    {#if providerDisabledMsg}
      <p class="text-sm text-danger">{providerDisabledMsg}</p>
    {:else if errorMsg}
      <p class="text-sm text-danger">{errorMsg}</p>
    {/if}
  {/if}
</div>
