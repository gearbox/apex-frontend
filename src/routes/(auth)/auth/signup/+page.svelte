<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    completeOAuthSignup,
    fetchOAuthSignupInfo,
    AuthError,
    AuthOperationCancelledError,
  } from '$lib/api/auth';
  import { toAcceptedDocuments } from '$lib/api/legal';
  import * as oauthPendingSignup from '$lib/api/oauthPendingSignup';
  import type { OAuthPendingSignup } from '$lib/api/oauthPendingSignup';
  import OAuthErrorPanel from '$lib/components/auth/OAuthErrorPanel.svelte';
  import LegalAcceptanceFields from '$lib/components/legal/LegalAcceptanceFields.svelte';
  import { createSignupLegalForm } from '$lib/legal/signupLegalForm.svelte';
  import { appDisplayName } from '$lib/stores/product';
  import { locale } from '$lib/stores/locale';
  import { updateUserLocale } from '$lib/api/user';
  import { ROUTES } from '$lib/utils/routes';
  import { safeReturnPath } from '$lib/utils/returnPath';
  import type { OAuthErrorCode } from '$lib/api/oauth';
  import * as m from '$paraglide/messages';

  const legalForm = createSignupLegalForm();
  let pending = $state<OAuthPendingSignup | null>(null);
  let email = $state('');
  let signupInfoReady = $state(false);
  let displayName = $state('');
  let loading = $state(true);
  let submitting = $state(false);
  let inlineError = $state('');
  let terminalError = $state<OAuthErrorCode | 'email_exists' | null>(null);
  let errorReturnTo = $state<string | null>(null);
  let canSubmit = $derived(signupInfoReady && !loading && !submitting && legalForm.canSubmit);

  async function loadSignupInfo(): Promise<void> {
    inlineError = '';
    signupInfoReady = false;
    pending = oauthPendingSignup.load();
    errorReturnTo = pending?.returnTo ?? null;
    if (!pending) {
      terminalError = 'invalid_signup_ticket';
      loading = false;
      return;
    }

    loading = true;
    try {
      const info = await fetchOAuthSignupInfo(pending.ticket);
      email = info.email;
      signupInfoReady = true;
    } catch (error) {
      if (error instanceof AuthError && error.error === 'invalid_signup_ticket') {
        oauthPendingSignup.clear();
        pending = null;
        terminalError = 'invalid_signup_ticket';
      } else {
        inlineError = error instanceof AuthError ? error.message : m.error_generic();
      }
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadSignupInfo();
  });

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!pending || !canSubmit) return;

    inlineError = '';
    submitting = true;
    const normalizedDisplayName = displayName.trim();
    try {
      await completeOAuthSignup(
        pending.ticket,
        toAcceptedDocuments(legalForm.currentLegal),
        normalizedDisplayName || undefined,
      );
      oauthPendingSignup.clear();
      void updateUserLocale($locale);
      await goto(safeReturnPath(pending.returnTo) ?? ROUTES.create, { replaceState: true });
    } catch (error) {
      if (error instanceof AuthOperationCancelledError) return;
      if (error instanceof AuthError) {
        if (error.error === 'legal_version_stale') {
          inlineError = m.legal_version_stale();
          await legalForm.refresh();
        } else if (error.error === 'legal_acceptance_incomplete') {
          inlineError = m.legal_acceptance_incomplete();
          await legalForm.refresh();
        } else if (
          error.error === 'invalid_signup_ticket' ||
          error.error === 'email_exists' ||
          error.error === 'identity_conflict'
        ) {
          oauthPendingSignup.clear();
          pending = null;
          terminalError = error.error;
        } else {
          // Rate limits and temporary failures do not consume a valid ticket.
          inlineError = error.message;
        }
      } else {
        inlineError = m.error_generic();
      }
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>{m.auth_oauth_signup_title({ brand: $appDisplayName })}</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-bg px-4">
  <div class="w-full max-w-sm">
    {#if terminalError}
      <OAuthErrorPanel code={terminalError} returnTo={errorReturnTo} />
    {:else if loading}
      <div
        class="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted"
      >
        {m.auth_oauth_signing_in()}
      </div>
    {:else if !signupInfoReady}
      <div class="rounded-xl border border-danger/30 bg-danger/10 p-4 text-center">
        <p class="text-sm text-danger">{inlineError || m.error_generic()}</p>
        <button
          type="button"
          class="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
          onclick={loadSignupInfo}
        >
          {m.common_retry()}
        </button>
      </div>
    {:else}
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-bold text-accent">{$appDisplayName}</h1>
        <p class="mt-2 text-sm text-text-muted">
          {m.auth_oauth_signup_email({ brand: $appDisplayName, email })}
        </p>
      </div>

      <form onsubmit={handleSubmit} class="flex flex-col gap-4">
        {#if inlineError}
          <div
            class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {inlineError}
          </div>
        {/if}

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-text">{m.auth_register_display_name()}</span>
          <input
            type="text"
            bind:value={displayName}
            maxlength="100"
            autocomplete="name"
            class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
            placeholder="Jane Doe"
          />
        </label>

        {#if legalForm.currentLegalQuery.isError || legalForm.exactDocuments.error}
          <div
            class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            <p>{m.legal_documents_load_error()}</p>
            <button class="mt-2 underline" type="button" onclick={legalForm.refresh}>
              {m.common_retry()}
            </button>
          </div>
        {:else if legalForm.currentLegal.length > 0}
          <LegalAcceptanceFields
            bind:this={legalForm.state.acceptanceFields}
            current={legalForm.currentLegal}
            bind:valid={legalForm.state.valid}
          />
          {#if legalForm.loading}
            <p class="text-xs text-text-dim">{m.legal_documents_loading()}</p>
          {/if}
        {/if}

        <button
          type="submit"
          disabled={!canSubmit}
          class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? m.auth_register_creating() : m.auth_register_submit()}
        </button>
      </form>
    {/if}
  </div>
</div>
