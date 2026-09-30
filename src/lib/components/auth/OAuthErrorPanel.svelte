<script lang="ts">
  import { onMount } from 'svelte';
  import { startOAuthSignIn, type OAuthErrorCode } from '$lib/api/oauth';
  import * as m from '$paraglide/messages';

  interface Props {
    code: OAuthErrorCode | 'email_exists';
    returnTo?: string | null;
  }

  let { code, returnTo = null }: Props = $props();
  let interactive = $state(false);
  let restarting = $state(false);

  // The server-rendered error panel is visible before Svelte attaches its click handlers. Keep
  // the retry action inert until mount so a fast tap cannot be silently lost.
  onMount(() => {
    interactive = true;
  });

  const copy = $derived.by(() => {
    switch (code) {
      case 'oauth_cancelled':
        return m.auth_oauth_error_cancelled();
      case 'flow_expired':
        return m.auth_oauth_error_flow_expired();
      case 'email_unverified':
        return m.auth_oauth_error_email_unverified();
      case 'account_inactive':
        return m.auth_oauth_error_account_inactive();
      case 'identity_conflict':
        return m.auth_oauth_error_identity_conflict();
      case 'invalid_handoff':
        return m.auth_oauth_error_invalid_handoff();
      case 'invalid_signup_ticket':
        return m.auth_oauth_error_invalid_signup_ticket();
      case 'email_exists':
        return m.auth_oauth_error_email_exists();
      default:
        return m.auth_oauth_error_failed();
    }
  });

  let retryable = $derived(
    [
      'oauth_cancelled',
      'oauth_failed',
      'flow_expired',
      'invalid_handoff',
      'invalid_signup_ticket',
      'identity_conflict',
    ].includes(code),
  );

  function tryAgain(): void {
    if (restarting) return;
    restarting = true;
    startOAuthSignIn('google', returnTo);
  }
</script>

<section class="rounded-xl border border-danger/30 bg-danger/10 p-4 text-center" role="alert">
  <p class="text-sm leading-6 text-text">{copy}</p>

  <div class="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
    {#if retryable}
      <button
        type="button"
        disabled={restarting || !interactive}
        onclick={tryAgain}
        class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {m.auth_oauth_try_again()}
      </button>
      <a
        href="/login"
        class="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text"
      >
        {m.auth_oauth_back_to_signin()}
      </a>
    {:else if code === 'email_unverified'}
      <a href="/register" class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
        {m.auth_oauth_signup_with_email()}
      </a>
    {:else}
      <a href="/login" class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
        {m.auth_oauth_back_to_signin()}
      </a>
    {/if}
  </div>
</section>
