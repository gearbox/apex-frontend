<script lang="ts">
  import { goto } from '$app/navigation';
  import { register, AuthError } from '$lib/api/auth';
  import { productInfo, requiresAgeGate } from '$lib/stores/product';
  import AgeGate from '$lib/components/AgeGate.svelte';
  import { locale } from '$lib/stores/locale';
  import { updateUserLocale } from '$lib/api/user';
  import * as m from '$paraglide/messages';

  let email = $state('');
  let password = $state('');
  let displayName = $state('');
  let error = $state('');
  let loading = $state(false);

  // Age gate state — confirmed by AgeGate component before the form is shown
  let ageGateConfirmed = $state(false);
  let ageConfirmed = $state<boolean | undefined>(undefined);
  let dateOfBirth = $state<string | undefined>(undefined);

  // Show the age gate interstitial when required and not yet confirmed
  let showAgeGate = $derived($requiresAgeGate && !ageGateConfirmed);

  // Only show email/password form if the product allows it (or product info not yet loaded)
  let allowsEmailPassword = $derived(
    !$productInfo || $productInfo.allowed_auth_methods.includes('email_password'),
  );

  function onAgeConfirmed(result: { ageConfirmed?: boolean; dateOfBirth?: string }) {
    ageConfirmed = result.ageConfirmed;
    dateOfBirth = result.dateOfBirth;
    ageGateConfirmed = true;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      await register(email, password, displayName || undefined, ageConfirmed, dateOfBirth);
      // Fire-and-forget locale sync — never blocks register flow
      void (async () => {
        try {
          await updateUserLocale($locale);
        } catch {
          // silently swallow — locale sync is best-effort
        }
      })();
      goto('/app/create', { replaceState: true });
    } catch (err) {
      if (err instanceof AuthError) {
        if (err.error === 'email_exists') {
          error = 'An account with this email already exists.';
        } else if (err.error === 'age_verification_required') {
          error = 'Age verification is required to register.';
        } else {
          error = err.message;
        }
      } else {
        error = m.error_generic();
      }
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign Up — {$productInfo?.display_name ?? 'Vex.pics'}</title>
</svelte:head>

{#if showAgeGate}
  <AgeGate
    ageGateMode={$productInfo!.age_gate as 'checkbox' | 'date_of_birth'}
    onConfirmed={onAgeConfirmed}
  />
{:else}
  <div class="flex min-h-dvh items-center justify-center bg-bg px-4">
    <div class="w-full max-w-sm">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-bold text-accent">{$productInfo?.display_name ?? 'Vex.pics'}</h1>
        <p class="mt-2 text-sm text-text-muted">{m.auth_register_title()}</p>
      </div>

      {#if allowsEmailPassword}
        <form onsubmit={handleSubmit} class="flex flex-col gap-4">
          {#if error}
            <div class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          {/if}

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-text">{m.auth_register_display_name()}</span>
            <input
              type="text"
              bind:value={displayName}
              autocomplete="name"
              class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
              placeholder="Jane Doe"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-text">{m.auth_register_email()}</span>
            <input
              type="email"
              bind:value={email}
              required
              autocomplete="email"
              class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
              placeholder="you@example.com"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-text">{m.auth_register_password()}</span>
            <input
              type="password"
              bind:value={password}
              required
              minlength={8}
              autocomplete="new-password"
              class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? m.auth_register_creating() : m.auth_register_submit()}
          </button>
        </form>
      {:else}
        <p class="text-center text-sm text-text-muted">
          Email/password registration is not available for this product.
        </p>
      {/if}

      <p class="mt-6 text-center text-sm text-text-muted">
        {m.auth_register_has_account()}
        <a href="/login" class="font-medium text-accent hover:underline">{m.auth_register_login()}</a>
      </p>
    </div>
  </div>
{/if}
