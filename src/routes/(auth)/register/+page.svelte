<script lang="ts">
  import { goto } from '$app/navigation';
  import { createQuery } from '@tanstack/svelte-query';
  import { register, AuthError, AuthOperationCancelledError } from '$lib/api/auth';
  import { toAcceptedDocuments } from '$lib/api/legal';
  import { currentLegalQueryOptions } from '$lib/queries/legal';
  import { createExactDocuments } from '$lib/legal/exactDocuments.svelte';
  import LegalAcceptanceFields from '$lib/components/legal/LegalAcceptanceFields.svelte';
  import { appDisplayName, productInfo } from '$lib/stores/product';
  import { locale } from '$lib/stores/locale';
  import { updateUserLocale } from '$lib/api/user';
  import * as m from '$paraglide/messages';

  let email = $state('');
  let password = $state('');
  let displayName = $state('');
  let error = $state('');
  let loading = $state(false);
  let legalValid = $state(true);
  let acceptanceFields = $state<LegalAcceptanceFields>();

  const currentLegalQuery = createQuery(() => currentLegalQueryOptions());
  const exactDocuments = createExactDocuments(() => currentLegalQuery.data, {
    // A new `/current` set always needs an explicit, fresh acknowledgement.
    onPayloadChange: () => {
      acceptanceFields?.reset();
      legalValid = (currentLegalQuery.data?.length ?? 0) === 0;
    },
  });

  // Only show email/password form if the product allows it (or product info not yet loaded)
  let allowsEmailPassword = $derived(
    !$productInfo || $productInfo.allowed_auth_methods.includes('email_password'),
  );
  let currentLegal = $derived(currentLegalQuery.data ?? []);
  let legalLoading = $derived(
    currentLegalQuery.isPending || currentLegalQuery.isFetching || !exactDocuments.ready,
  );
  let canSubmit = $derived(
    !loading &&
      !currentLegalQuery.isPending &&
      // A `/current` that is being replaced must not be echoed back to the API.
      !currentLegalQuery.isFetching &&
      !currentLegalQuery.isError &&
      !exactDocuments.error &&
      exactDocuments.ready &&
      legalValid,
  );

  async function refreshLegalForm() {
    acceptanceFields?.reset();
    legalValid = currentLegal.length === 0;
    await currentLegalQuery.refetch();
    await exactDocuments.reload();
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      await register(email, password, displayName || undefined, toAcceptedDocuments(currentLegal));
      // Fire-and-forget locale sync — never blocks register flow
      void updateUserLocale($locale);
      goto('/app/create', { replaceState: true });
    } catch (err) {
      if (err instanceof AuthOperationCancelledError) {
        // A newer login/register attempt owns the auth boundary. It is not user-visible failure.
        return;
      }
      if (err instanceof AuthError) {
        if (err.error === 'legal_version_stale') {
          error = m.legal_version_stale();
          await refreshLegalForm();
        } else if (err.error === 'legal_acceptance_incomplete') {
          if (import.meta.env.DEV) console.error('Incomplete legal acceptance payload', err.detail);
          error = m.legal_acceptance_incomplete();
          await refreshLegalForm();
        } else if (err.error === 'email_exists') {
          error = 'An account with this email already exists.';
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
  <title>Sign Up — {$appDisplayName}</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-bg px-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-accent">{$appDisplayName}</h1>
      <p class="mt-2 text-sm text-text-muted">{m.auth_register_title()}</p>
    </div>

    {#if allowsEmailPassword}
      <form onsubmit={handleSubmit} class="flex flex-col gap-4">
        {#if error}
          <div
            class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
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

        {#if currentLegalQuery.isError || exactDocuments.error}
          <div
            class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            <p>{m.legal_documents_load_error()}</p>
            <button class="mt-2 underline" type="button" onclick={refreshLegalForm}>
              {m.common_retry()}
            </button>
          </div>
        {:else if currentLegal.length > 0}
          <LegalAcceptanceFields
            bind:this={acceptanceFields}
            current={currentLegal}
            bind:valid={legalValid}
          />
          {#if legalLoading}
            <p class="text-xs text-text-dim">{m.legal_documents_loading()}</p>
          {/if}
        {/if}

        <button
          type="submit"
          disabled={!canSubmit}
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
