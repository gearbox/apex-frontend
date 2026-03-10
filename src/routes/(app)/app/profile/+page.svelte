<script lang="ts">
  import { goto } from '$app/navigation';
  import { logout } from '$lib/api/auth';
  import ProfileFields from '$lib/components/profile/ProfileFields.svelte';
  import ThemeSelector from '$lib/components/profile/ThemeSelector.svelte';
  import ModeSelector from '$lib/components/profile/ModeSelector.svelte';

  let loggingOut = $state(false);

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

  <!-- Appearance -->
  <div class="appearance-section">
    <p class="section-header">Appearance</p>
    <ThemeSelector />
    <ModeSelector />
  </div>

  <!-- Actions -->
  <div class="actions">
    <button class="action-btn">Change Password</button>
    <button class="action-btn">Logout All Devices</button>
    <button
      onclick={handleLogout}
      disabled={loggingOut}
      class="action-btn"
    >
      {loggingOut ? 'Signing out…' : 'Sign Out'}
    </button>
    <button class="action-btn danger">Delete Account</button>
  </div>
</div>

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
