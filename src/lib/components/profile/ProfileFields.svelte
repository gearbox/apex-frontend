<script lang="ts">
  import { currentUser } from '$lib/stores/auth';
</script>

<div class="profile-header">
  <div class="avatar">
    {$currentUser?.display_name?.charAt(0).toUpperCase() ??
      $currentUser?.email?.charAt(0).toUpperCase() ??
      'M'}
  </div>
  <div>
    <p class="name">{$currentUser?.display_name ?? 'User'}</p>
    <p class="email">{$currentUser?.email ?? 'user@example.com'}</p>
  </div>
</div>

<div class="fields">
  {#each [
    { label: 'Display Name', value: $currentUser?.display_name ?? '—' },
    { label: 'Account Type', value: $currentUser?.subscription_tier ?? 'Personal' },
    { label: 'Member Since', value: $currentUser?.created_at ? new Date($currentUser.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Jan 2026' },
  ] as field (field.label)}
    <div class="field-row">
      <p class="field-label">{field.label}</p>
      <p class="field-value">{field.value}</p>
    </div>
  {/each}
</div>

<style>
  .profile-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 24px;
  }

  .avatar {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--apex-accent-dim), var(--apex-accent));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 800;
    color: #fff;
    flex-shrink: 0;
  }

  .name {
    font-size: 15px;
    font-weight: 700;
    color: var(--apex-text);
    margin: 0;
  }

  .email {
    font-size: 12px;
    color: var(--apex-text-muted);
    margin: 2px 0 0;
  }

  .fields {
    margin-bottom: 0;
  }

  .field-row {
    padding: 12px 0;
    border-bottom: 1px solid var(--apex-border);
  }

  .field-label {
    font-size: 10px;
    color: var(--apex-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 3px;
  }

  .field-value {
    font-size: 14px;
    color: var(--apex-text);
    margin: 0;
  }
</style>
