<script lang="ts">
  // Google Sign-In branding kit: Google_G_logo.svg (standalone "G" logo), retrieved 2026-09-29.
  import { productInfo } from '$lib/stores/product';
  import { startOAuthSignIn } from '$lib/api/oauth';
  import { safeReturnPath } from '$lib/utils/returnPath';
  import * as m from '$paraglide/messages';

  interface Props {
    returnTo: string | null;
    /** Render the email/oauth separator only when an email form follows this component. */
    showDivider?: boolean;
  }

  let { returnTo, showDivider = false }: Props = $props();
  let navigating = $state(false);
  let googleEnabled = $derived(
    $productInfo?.allowed_auth_methods.includes('google_oauth') ?? false,
  );

  function continueWithGoogle(): void {
    if (navigating) return;
    navigating = true;
    startOAuthSignIn('google', safeReturnPath(returnTo));
  }
</script>

{#if googleEnabled}
  <div class="flex flex-col gap-4">
    <button
      type="button"
      disabled={navigating}
      onclick={continueWithGoogle}
      class="flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text shadow-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      <img src="/google-g.svg" alt="" class="h-[18px] w-[18px]" />
      {m.auth_oauth_continue_google()}
    </button>

    {#if showDivider}
      <div class="flex items-center gap-3 text-xs text-text-dim" aria-hidden="true">
        <span class="h-px flex-1 bg-border"></span>
        {m.auth_oauth_or()}
        <span class="h-px flex-1 bg-border"></span>
      </div>
    {/if}
  </div>
{/if}
