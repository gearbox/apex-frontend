<script lang="ts">
  import { startOAuthSignIn, type OAuthErrorCode } from '$lib/api/oauth';
  import * as m from '$paraglide/messages';

  interface Props {
    code: OAuthErrorCode | 'email_exists';
  }

  let { code }: Props = $props();
  let restarting = $state(false);

  const copy = $derived.by(() => {
    switch (code) {
      case 'oauth_cancelled':
        return m.auth_oauth_error_cancelled();
      case 'flow_expired':
        return m.auth_oauth_error_flow_expired();
      case 'email_unverified':
        return m.auth_oauth_error_email_unverified();
      case 'account_exists_unverified':
        return m.auth_oauth_error_account_exists_unverified();
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
    startOAuthSignIn('google', null);
  }
</script>

<section class="rounded-xl border border-danger/30 bg-danger/10 p-4 text-center" role="alert">
  <p class="text-sm leading-6 text-text">{copy}</p>

  <div class="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
    {#if retryable}
      <button
        type="button"
        disabled={restarting}
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
    {:else if code === 'account_exists_unverified'}
      <a href="/login" class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
        {m.auth_oauth_signin_with_password()}
      </a>
      <a
        href="/forgot-password"
        class="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text"
      >
        {m.auth_login_forgot()}
      </a>
    {:else}
      <a href="/login" class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
        {m.auth_oauth_back_to_signin()}
      </a>
    {/if}
  </div>
</section>
