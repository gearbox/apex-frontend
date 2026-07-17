<script lang="ts">
  import { CircleDollarSign } from 'lucide-svelte';
  import * as m from '$paraglide/messages';
  import type { PublicCurrency } from '$lib/api/billing';

  interface Props {
    currencies: PublicCurrency[];
    value?: string | null;
    disabled?: boolean;
  }

  let { currencies, value = $bindable<string | null>(null), disabled = false }: Props = $props();
  let failedLogos = $state<Set<string>>(new Set());

  const sortedCurrencies = $derived(
    [...currencies].sort((left, right) => {
      const leftNetwork = left.network ?? '';
      const rightNetwork = right.network ?? '';
      return (
        leftNetwork.localeCompare(rightNetwork) ||
        (left.name ?? left.ticker).localeCompare(right.name ?? right.ticker) ||
        left.ticker.localeCompare(right.ticker)
      );
    }),
  );

  function label(currency: PublicCurrency): string {
    return currency.name ?? currency.ticker;
  }

  function markLogoFailed(ticker: string): void {
    failedLogos = new Set([...failedLogos, ticker]);
  }
</script>

{#if sortedCurrencies.length > 0}
  <fieldset class="currency-picker" aria-describedby="payment-currency-help">
    <legend class="currency-label">{m.billing_topup_currency_label()}</legend>
    <p id="payment-currency-help" class="currency-help">{m.billing_currency_picker_hint()}</p>

    <div class="currency-options">
      {#each sortedCurrencies as currency (currency.ticker)}
        {@const hasLogo = currency.logo_url !== null && !failedLogos.has(currency.ticker)}
        <label class="currency-option" class:selected={value === currency.ticker}>
          <input
            type="radio"
            name="payment-currency"
            value={currency.ticker}
            bind:group={value}
            {disabled}
          />
          {#if hasLogo}
            <img
              src={currency.logo_url}
              alt={m.billing_currency_logo_alt({ currency: label(currency) })}
              onerror={() => markLogoFailed(currency.ticker)}
            />
          {:else}
            <span class="currency-icon" aria-hidden="true"><CircleDollarSign size={18} /></span>
          {/if}
          <span class="currency-copy">
            <span class="currency-name">{label(currency)}</span>
            <span class="currency-ticker">{currency.ticker}</span>
          </span>
          {#if currency.network !== null}
            <span class="network-chip">{currency.network}</span>
          {/if}
        </label>
      {/each}

      <label class="currency-option" class:selected={value === null}>
        <input
          type="radio"
          name="payment-currency"
          checked={value === null}
          onchange={() => (value = null)}
          {disabled}
        />
        <span class="currency-icon" aria-hidden="true"><CircleDollarSign size={18} /></span>
        <span class="currency-copy">
          <span class="currency-name">{m.billing_currency_picker_other()}</span>
          <span class="currency-ticker">{m.billing_currency_picker_other_hint()}</span>
        </span>
      </label>
    </div>
  </fieldset>
{/if}

<style>
  .currency-picker {
    border: 0;
    margin: 0;
    min-width: 0;
    padding: 0;
  }
  .currency-label {
    color: var(--apex-text-muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .currency-help {
    color: var(--apex-text-dim);
    font-size: 12px;
    margin: 4px 0 8px;
  }
  .currency-options {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
  .currency-option {
    align-items: center;
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    gap: 8px;
    min-height: 54px;
    padding: 8px;
  }
  .currency-option.selected {
    border-color: var(--apex-accent);
    background: color-mix(in srgb, var(--apex-accent) 8%, var(--apex-surface));
  }
  .currency-option:has(input:focus-visible) {
    outline: 2px solid var(--apex-accent);
    outline-offset: 2px;
  }
  .currency-option:has(input:disabled) {
    cursor: not-allowed;
    opacity: 0.6;
  }
  .currency-option input {
    accent-color: var(--apex-accent);
    flex: 0 0 auto;
  }
  .currency-option img,
  .currency-icon {
    align-items: center;
    display: flex;
    flex: 0 0 auto;
    height: 28px;
    justify-content: center;
    object-fit: contain;
    width: 28px;
  }
  .currency-icon {
    color: var(--apex-text-muted);
  }
  .currency-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .currency-name {
    color: var(--apex-text);
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .currency-ticker {
    color: var(--apex-text-dim);
    font-family: monospace;
    font-size: 10px;
  }
  .network-chip {
    background: var(--apex-surface-hover);
    border-radius: 999px;
    color: var(--apex-text-muted);
    font-size: 10px;
    padding: 2px 6px;
  }
</style>
