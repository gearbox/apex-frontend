<script lang="ts">
  import { afterNavigate, goto, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { login, AuthError, AuthOperationCancelledError } from '$lib/api/auth';
  import OAuthProviderButtons from '$lib/components/auth/OAuthProviderButtons.svelte';
  import { consumeAuthFailureReason, type AuthFailureReason } from '$lib/stores/auth';
  import { appDisplayName, productInfo } from '$lib/stores/product';
  import { rateLimitFor } from '$lib/stores/rateLimit';
  import { locale } from '$lib/stores/locale';
  import { updateUserLocale } from '$lib/api/user';
  import { ROUTES } from '$lib/utils/routes';
  import { safeReturnPath } from '$lib/utils/returnPath';
  import { withoutSearchParam } from '$lib/utils/urlSearch';
  import * as m from '$paraglide/messages';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);
  // `invalid_token` / `network` stay silent (the ordinary "session ended elsewhere" case) —
  // only a genuine security event gets a banner here (B2).
  let sessionEndReason = $state<AuthFailureReason | null>(null);
  let resetDone = $state(false);

  // SvelteKit's router root is unavailable during the initial onMount.
  // Consume entry parameters once, after router initialization.
  let initialized = false;
  afterNavigate(() => {
    if (initialized) return;
    initialized = true;
    resetDone = $page.url.searchParams.get('reset') === 'done';
    const reason = consumeAuthFailureReason();
    sessionEndReason = resetDone ? null : reason;
    if ($page.url.searchParams.has('reset')) {
      replaceState(withoutSearchParam($page.url, 'reset'), $page.state);
    }
  });

  const loginRateLimit = rateLimitFor('/v1/auth/login');
  let returnTo = $derived(safeReturnPath($page.url.searchParams.get('redirect')));
  let allowsEmailPassword = $derived(
    !$productInfo || $productInfo.allowed_auth_methods.includes('email_password'),
  );

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      await login(email, password);
      // Fire-and-forget locale sync — never blocks login flow
      void updateUserLocale($locale);
      const redirect = safeReturnPath($page.url.searchParams.get('redirect')) ?? ROUTES.create;
      goto(redirect, { replaceState: true });
    } catch (err) {
      if (err instanceof AuthOperationCancelledError) {
        // A newer login/register attempt owns the auth boundary. It is not user-visible failure.
        return;
      }
      if (err instanceof AuthError) {
        error = err.message;
      } else {
        error = m.error_generic();
      }
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Login — {$appDisplayName}</title>
</svelte:head>

<div class="mx-auto w-full max-w-sm">
  <div class="mb-8 text-center">
    <h1 class="text-2xl font-bold text-accent">{$appDisplayName}</h1>
    <p class="mt-2 text-sm text-text-muted">{m.auth_login_subtitle()}</p>
  </div>

  {#if resetDone}
    <div
      role="status"
      class="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
    >
      {m.auth_reset_done()}
    </div>
  {:else if sessionEndReason === 'token_reuse_detected'}
    <div class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
      <p class="font-semibold">{m.auth_security_notice_title()}</p>
      <p>{m.auth_security_notice_message()}</p>
    </div>
  {:else if sessionEndReason === 'account_inactive'}
    <div
      class="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
    >
      {m.auth_account_deactivated_message()}
    </div>
  {/if}

  <OAuthProviderButtons {returnTo} showDivider={allowsEmailPassword} />

  {#if allowsEmailPassword}
    <form onsubmit={handleSubmit} class="flex flex-col gap-4">
      {#if error}
        <div class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      {/if}

      {#if $loginRateLimit?.remaining !== undefined && $loginRateLimit.remaining <= 3}
        <div
          class="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          {m.auth_login_attempts_remaining({ remaining: $loginRateLimit.remaining })}
        </div>
      {/if}

      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text">{m.auth_login_email()}</span>
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
        <span class="text-sm font-medium text-text">{m.auth_login_password()}</span>
        <input
          type="password"
          bind:value={password}
          required
          autocomplete="current-password"
          class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          placeholder="••••••••"
        />
      </label>

      <div class="flex justify-end">
        <a href="/forgot-password" class="text-xs text-accent hover:underline">
          {m.auth_login_forgot()}
        </a>
      </div>

      <button
        type="submit"
        disabled={loading}
        class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? m.auth_login_signing_in() : m.auth_login_submit()}
      </button>
    </form>
  {/if}

  <p class="mt-6 text-center text-sm text-text-muted">
    {m.auth_login_no_account()}
    <a href="/register" class="font-medium text-accent hover:underline">{m.auth_login_register()}</a
    >
  </p>
</div>
