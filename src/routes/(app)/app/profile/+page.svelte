<script lang="ts">
  import { goto } from '$app/navigation';
  import { logout } from '$lib/api/auth';
  import ProfileFields from '$lib/components/profile/ProfileFields.svelte';
  import ThemeSelector from '$lib/components/profile/ThemeSelector.svelte';
  import ModeSelector from '$lib/components/profile/ModeSelector.svelte';
  import LanguageSelector from '$lib/components/profile/LanguageSelector.svelte';
  import UserStats from '$lib/components/profile/UserStats.svelte';
  import ChangePasswordModal from '$lib/components/profile/ChangePasswordModal.svelte';
  import LogoutAllModal from '$lib/components/profile/LogoutAllModal.svelte';
  import DeleteAccountModal from '$lib/components/profile/DeleteAccountModal.svelte';
  import * as m from '$paraglide/messages';

  let loggingOut = $state(false);
  let showChangePassword = $state(false);
  let showLogoutAll = $state(false);
  let showDeleteAccount = $state(false);

  async function handleLogout() {
    loggingOut = true;
    await logout();
    goto('/login', { replaceState: true });
  }
</script>

<svelte:head>
  <title>Profile — Apex</title>
</svelte:head>

<div class="profile-page">
  <ProfileFields />

  <UserStats />

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

  <!-- Actions -->
  <div class="actions">
    <button class="action-btn" onclick={() => (showChangePassword = true)}>{m.profile_change_password()}</button>
    <button class="action-btn" onclick={() => (showLogoutAll = true)}>{m.profile_logout_all()}</button>
    <button
      onclick={handleLogout}
      disabled={loggingOut}
      class="action-btn"
    >
      {loggingOut ? m.profile_signing_out() : m.profile_logout()}
    </button>
    <button class="action-btn danger" onclick={() => (showDeleteAccount = true)}>{m.profile_delete_account()}</button>
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
  .profile-page {
    max-width: 520px;
    padding: 16px;
  }

  @media (min-width: 768px) {
    .profile-page { padding: 0; }
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
</style>
