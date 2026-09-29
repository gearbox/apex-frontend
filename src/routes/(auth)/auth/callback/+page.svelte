<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    exchangeOAuthCode,
    AuthError,
    AuthOperationCancelledError,
    OAuthCodeAlreadyUsedError,
  } from '$lib/api/auth';
  import { clearCapturedOAuthFragment, getCapturedOAuthFragment } from '$lib/api/oauthFragment';
  import * as oauthPendingSignup from '$lib/api/oauthPendingSignup';
  import * as oauthReturnTarget from '$lib/api/oauthReturnTarget';
  import OAuthErrorPanel from '$lib/components/auth/OAuthErrorPanel.svelte';
  import { appDisplayName } from '$lib/stores/product';
  import { locale } from '$lib/stores/locale';
  import { updateUserLocale } from '$lib/api/user';
  import { ROUTES } from '$lib/utils/routes';
  import { safeReturnPath } from '$lib/utils/returnPath';
  import type { OAuthErrorCode } from '$lib/api/oauth';
  import * as m from '$paraglide/messages';

  const fragment = getCapturedOAuthFragment();
  const fragmentReturnTo =
    fragment?.result === 'login' || fragment?.result === 'signup' ? fragment.returnTo : null;
  const errorReturnTo = fragmentReturnTo ?? oauthReturnTarget.load();

  let viewState = $state<'working' | 'error'>('working');
  let errorCode = $state<OAuthErrorCode>('oauth_failed');

  function showError(code: OAuthErrorCode): void {
    clearCapturedOAuthFragment();
    oauthPendingSignup.clear();
    errorCode = code;
    viewState = 'error';
  }

  // The callback is a transit page: every exit replaces its history entry so Back never re-enters it.
  async function dispatch(): Promise<void> {
    if (fragment?.result === 'login') {
      try {
        await exchangeOAuthCode(fragment.code);
        void updateUserLocale($locale);
        clearCapturedOAuthFragment();
        oauthReturnTarget.clear();
        await goto(safeReturnPath(fragment.returnTo) ?? ROUTES.create, { replaceState: true });
      } catch (error) {
        if (
          error instanceof AuthOperationCancelledError ||
          error instanceof OAuthCodeAlreadyUsedError
        ) {
          return;
        }
        showError(
          error instanceof AuthError &&
            (error.error === 'invalid_handoff' || error.error === 'account_inactive')
            ? error.error
            : 'oauth_failed',
        );
      }
      return;
    }

    if (fragment?.result === 'signup') {
      oauthPendingSignup.save({
        ticket: fragment.ticket,
        returnTo: fragment.returnTo,
        savedAt: Date.now(),
      });
      clearCapturedOAuthFragment();
      await goto('/auth/signup', { replaceState: true });
      return;
    }

    if (fragment?.result === 'error') {
      showError(fragment.error);
      return;
    }

    // After a reload/back navigation the fragment has already been stripped, but the signed-up
    // tab can safely resume from the non-secret sessionStorage record.
    if (fragment === null && oauthPendingSignup.load()) {
      clearCapturedOAuthFragment();
      await goto('/auth/signup', { replaceState: true });
      return;
    }
    showError('oauth_failed');
  }

  onMount(() => {
    void dispatch();
  });
</script>

<svelte:head>
  <title>{m.auth_oauth_callback_title({ brand: $appDisplayName })}</title>
</svelte:head>

<div class="mx-auto w-full max-w-sm">
  {#if viewState === 'working'}
    <div class="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted">
      {m.auth_oauth_signing_in()}
    </div>
  {:else}
    <OAuthErrorPanel code={errorCode} returnTo={errorReturnTo} />
  {/if}
</div>
