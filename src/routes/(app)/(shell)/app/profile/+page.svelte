<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { createMutation } from '@tanstack/svelte-query';
  import { logout, AuthError } from '$lib/api/auth';
  import { appDisplayName } from '$lib/stores/product';
  import ProfileFields from '$lib/components/profile/ProfileFields.svelte';
  import ThemeSelector from '$lib/components/profile/ThemeSelector.svelte';
  import ModeSelector from '$lib/components/profile/ModeSelector.svelte';
  import LanguageSelector from '$lib/components/profile/LanguageSelector.svelte';
  import UserStats from '$lib/components/profile/UserStats.svelte';
  import ChangePasswordModal from '$lib/components/profile/ChangePasswordModal.svelte';
  import LogoutAllModal from '$lib/components/profile/LogoutAllModal.svelte';
  import DeleteAccountModal from '$lib/components/profile/DeleteAccountModal.svelte';
  import InstallAppButton from '$lib/components/pwa/InstallAppButton.svelte';
  import PushNotificationToggle from '$lib/components/profile/PushNotificationToggle.svelte';
  import LegalSection from '$lib/components/profile/LegalSection.svelte';
  import { applyPwaUpdate, checkForAppUpdate, pwaUpdateStatus } from '$lib/services/pwaUpdate';
  import { appIsDirty } from '$lib/services/appDirty';
  import { APP_VERSION, BUILD_SHA } from '$lib/utils/appVersion';
  import { addToast } from '$lib/stores/toasts';
  import { currentUser, getCurrentUser, setUser } from '$lib/stores/auth';
  import { fetchCurrentUserProfile } from '$lib/api/user';
  import { isRequestCancellation } from '$lib/api/client';
  import { ApiRequestError } from '$lib/api/errors';
  import type { ResendVerificationResult } from '$lib/api/user';
  import { resendVerificationMutationOptions, setPasswordMutationOptions } from '$lib/queries/user';
  import * as m from '$paraglide/messages';

  let loggingOut = $state(false);
  let showChangePassword = $state(false);
  let showLogoutAll = $state(false);
  let showDeleteAccount = $state(false);
  let checkingForUpdate = $state(false);
  let setPasswordNotice = $state('');
  let setPasswordError = $state('');
  let verificationNotice = $state('');
  let verificationError = $state('');
  let refreshFlight: Promise<void> | null = null;
  const setPasswordMutation = createMutation(() => setPasswordMutationOptions());
  const resendMutation = createMutation(() => resendVerificationMutationOptions());

  async function refreshProfile(): Promise<void> {
    const userId = getCurrentUser()?.id;
    if (!userId) return;
    if (refreshFlight) return refreshFlight;
    refreshFlight = (async () => {
      const profile = await fetchCurrentUserProfile();
      if (getCurrentUser()?.id === userId) {
        setUser(profile);
        if (profile.email_verified) {
          verificationNotice = '';
          verificationError = '';
        }
      }
    })();
    try {
      await refreshFlight;
    } finally {
      refreshFlight = null;
    }
  }

  onMount(() => {
    const onFocus = () => {
      if (getCurrentUser()?.email_verified === false) {
        void refreshProfile().catch(() => undefined);
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  });

  async function handleResendVerification(): Promise<void> {
    if (!getCurrentUser() || resendMutation.isPending) return;
    const requestedUser = getCurrentUser();
    if (!requestedUser) return;
    verificationNotice = '';
    verificationError = '';

    let result: ResendVerificationResult;
    try {
      result = await resendMutation.mutateAsync();
    } catch (err) {
      if (isRequestCancellation(err)) return;
      verificationError =
        err instanceof ApiRequestError && err.status_code === 429
          ? m.error_rate_limited()
          : m.error_generic();
      return;
    }

    const currentUser = getCurrentUser();
    if (currentUser?.id !== requestedUser.id) return;
    if (result.kind === 'already_verified') {
      setUser({ ...currentUser, email_verified: true });
      return;
    }

    verificationNotice = m.profile_verification_sent({ email: requestedUser.email });
    void refreshProfile().catch(() => undefined);
  }

  let appTitle = $derived($appDisplayName);

  async function handleLogout() {
    loggingOut = true;
    await logout();
    goto('/login', { replaceState: true });
  }

  async function handleCheckForUpdates() {
    checkingForUpdate = true;
    try {
      const result = await checkForAppUpdate({ force: true, source: 'manual' });
      const message =
        result.status === 'up-to-date'
          ? m.pwa_update_current()
          : result.status === 'update-available'
            ? m.pwa_update_applying()
            : result.status === 'offline'
              ? m.pwa_update_offline()
              : m.pwa_update_check_failed();
      addToast({
        type:
          result.status === 'failed' || result.status === 'registration-unavailable'
            ? 'error'
            : 'info',
        message,
      });
    } finally {
      checkingForUpdate = false;
    }
  }

  async function handleApplyUpdate() {
    checkingForUpdate = true;
    try {
      await applyPwaUpdate();
    } finally {
      checkingForUpdate = false;
    }
  }

  async function handleSetPassword(): Promise<void> {
    if (!$currentUser) return;
    setPasswordNotice = '';
    setPasswordError = '';
    try {
      await setPasswordMutation.mutateAsync($currentUser.email);
      setPasswordNotice = m.profile_set_password_sent();
    } catch (err) {
      setPasswordError =
        err instanceof AuthError && err.status_code === 429
          ? m.error_rate_limited()
          : m.error_generic();
    }
  }
</script>

<svelte:head>
  <title>Profile — {appTitle}</title>
</svelte:head>

<div class="profile-page">
  <ProfileFields />

  {#if $currentUser}
    <div class="verification-row">
      {#if $currentUser.email_verified}
        <span class="verification-badge">{m.profile_email_verified()}</span>
      {:else}
        <span>{m.profile_email_not_verified()}</span>
        <button
          class="action-btn"
          onclick={handleResendVerification}
          disabled={resendMutation.isPending}
        >
          {resendMutation.isPending ? m.auth_forgot_sending() : m.auth_verify_resend()}
        </button>
      {/if}
      {#if verificationNotice}<p class="action-notice success" role="status">
          {verificationNotice}
        </p>{/if}
      {#if verificationError}<p class="action-notice error" role="alert">
          {verificationError}
        </p>{/if}
    </div>
  {/if}

  <UserStats />

  <LegalSection oncloseaccount={() => (showDeleteAccount = true)} />

  <!-- Appearance -->
  <div class="appearance-section">
    <p class="section-header">{m.profile_section_appearance()}</p>
    <ThemeSelector />
    <ModeSelector />
  </div>

  <!-- Language -->
  <div class="appearance-section">
    <p class="section-header">{m.profile_section_language()}</p>
    <LanguageSelector />
  </div>

  <!-- Notifications -->
  <div class="appearance-section">
    <p class="section-header">{m.profile_section_notifications()}</p>
    <PushNotificationToggle />
  </div>

  <div class="appearance-section">
    <p class="section-header">{m.pwa_update_section()}</p>
    <p class="build-label">{m.pwa_update_build({ version: APP_VERSION, buildSha: BUILD_SHA })}</p>
    {#if ['ready-to-activate', 'reload-required'].includes($pwaUpdateStatus.state)}
      <p class="update-ready-copy">
        {$appIsDirty ? m.pwa_update_dirty_title() : m.pwa_update_ready_title()}
      </p>
      <button class="action-btn" onclick={handleApplyUpdate} disabled={checkingForUpdate}>
        {checkingForUpdate
          ? m.common_loading()
          : $appIsDirty
            ? m.pwa_update_anyway()
            : m.pwa_update_now()}
      </button>
    {:else}
      <button class="action-btn" onclick={handleCheckForUpdates} disabled={checkingForUpdate}>
        {checkingForUpdate ? m.common_loading() : m.pwa_update_check()}
      </button>
    {/if}
  </div>

  <!-- Actions -->
  <div class="actions">
    <InstallAppButton />
    {#if $currentUser?.has_password !== false}
      <button class="action-btn" onclick={() => (showChangePassword = true)}
        >{m.profile_change_password()}</button
      >
    {:else}
      <button
        class="action-btn"
        onclick={handleSetPassword}
        disabled={setPasswordMutation.isPending}
      >
        {setPasswordMutation.isPending ? m.auth_forgot_sending() : m.profile_set_password()}
      </button>
      {#if setPasswordNotice}
        <p class="action-notice success">{setPasswordNotice}</p>
      {:else if setPasswordError}
        <p class="action-notice error">{setPasswordError}</p>
      {/if}
    {/if}
    <button class="action-btn" onclick={() => (showLogoutAll = true)}
      >{m.profile_logout_all()}</button
    >
    <button onclick={handleLogout} disabled={loggingOut} class="action-btn">
      {loggingOut ? m.profile_signing_out() : m.profile_logout()}
    </button>
    <button id="delete-account" class="action-btn danger" onclick={() => (showDeleteAccount = true)}
      >{m.profile_delete_account()}</button
    >
  </div>
</div>

{#if showChangePassword}
  <ChangePasswordModal onclose={() => (showChangePassword = false)} />
{/if}
{#if showLogoutAll}
  <LogoutAllModal onclose={() => (showLogoutAll = false)} />
{/if}
{#if showDeleteAccount}
  <DeleteAccountModal onclose={() => (showDeleteAccount = false)} />
{/if}

<style>
  .verification-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 12px 0 20px;
    font-size: 13px;
  }
  .verification-badge {
    border-radius: 999px;
    background: color-mix(in srgb, var(--apex-success) 12%, transparent);
    color: var(--apex-success);
    padding: 4px 10px;
  }
  .profile-page {
    max-width: 520px;
    padding: 16px;
  }

  @media (min-width: 768px) {
    .profile-page {
      padding: 0;
    }
  }

  .appearance-section {
    margin-top: 24px;
  }

  .section-header {
    font-size: 11px;
    color: var(--apex-text-muted);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 14px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 24px;
  }

  .build-label {
    margin: 0 0 10px;
    color: var(--apex-text-muted);
    font-family: var(--apex-font-mono, monospace);
    font-size: 12px;
  }

  .update-ready-copy {
    margin: 0 0 10px;
    color: var(--apex-text-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .action-btn {
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text);
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .action-btn.danger {
    border-color: color-mix(in srgb, var(--apex-danger) 20%, transparent);
    color: var(--apex-danger);
  }

  .action-notice {
    font-size: 13px;
    margin: 0;
  }

  .action-notice.success {
    color: var(--apex-success);
  }

  .action-notice.error {
    color: var(--apex-danger);
  }
</style>
