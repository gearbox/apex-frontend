<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import { exchangeOAuthCode, AuthError, AuthOperationCancelledError } from '$lib/api/auth';
  import { parseOAuthFragment } from '$lib/api/oauthFragment';
  import * as oauthPendingSignup from '$lib/api/oauthPendingSignup';
  import OAuthErrorPanel from '$lib/components/auth/OAuthErrorPanel.svelte';
  import { locale } from '$lib/stores/locale';
  import { updateUserLocale } from '$lib/api/user';
  import { ROUTES } from '$lib/utils/routes';
  import { safeReturnPath } from '$lib/utils/returnPath';
  import type { OAuthErrorCode } from '$lib/api/oauth';
  import * as m from '$paraglide/messages';

  // Capture synchronously, before SvelteKit replaces the entry in browser history.
  const rawFragment = location.hash;
  const fragment = parseOAuthFragment(rawFragment);

  let viewState = $state<'working' | 'error'>('working');
  let errorCode = $state<OAuthErrorCode>('oauth_failed');

  function showError(code: OAuthErrorCode): void {
    oauthPendingSignup.clear();
    errorCode = code;
    viewState = 'error';
  }

  async function dispatch(): Promise<void> {
    if (fragment.result === 'login') {
      try {
        await exchangeOAuthCode(fragment.code);
        void updateUserLocale($locale);
        await goto(safeReturnPath(fragment.returnTo) ?? ROUTES.create, { replaceState: true });
      } catch (error) {
        if (error instanceof AuthOperationCancelledError) return;
        showError(
          error instanceof AuthError &&
            (error.error === 'invalid_handoff' || error.error === 'account_inactive')
            ? error.error
            : 'oauth_failed',
        );
      }
      return;
    }

    if (fragment.result === 'signup') {
      oauthPendingSignup.save({
        ticket: fragment.ticket,
        returnTo: fragment.returnTo,
        savedAt: Date.now(),
      });
      await goto('/auth/signup', { replaceState: true });
      return;
    }

    if (fragment.result === 'error') {
      showError(fragment.error);
      return;
    }

    // After a reload/back navigation the fragment has already been stripped, but the signed-up
    // tab can safely resume from the non-secret sessionStorage record.
    if (!rawFragment && oauthPendingSignup.load()) {
      await goto('/auth/signup', { replaceState: true });
      return;
    }
    showError('oauth_failed');
  }

  onMount(() => {
    void startDispatch();
  });

  async function startDispatch(): Promise<void> {
    // Let SvelteKit finish installing its router root, then use its history helper rather than
    // the native history API. No network work starts before the fragment is removed.
    await tick();
    // This must be the first observable effect: opaque callback values never stay in history.
    replaceState(location.pathname + location.search, {});
    void dispatch();
  }
</script>

<svelte:head>
  <title>Google sign-in</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-bg px-4">
  <div class="w-full max-w-sm">
    {#if viewState === 'working'}
      <div
        class="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted"
      >
        {m.auth_oauth_signing_in()}
      </div>
    {:else}
      <OAuthErrorPanel code={errorCode} />
    {/if}
  </div>
</div>
