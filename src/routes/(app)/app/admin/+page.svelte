<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser, isAdmin } from '$lib/stores/auth';
  import { productInfo } from '$lib/stores/product';
  import AdminTabBar from '$lib/components/admin/AdminTabBar.svelte';
  import AdminUsersTab from '$lib/components/admin/AdminUsersTab.svelte';
  import AdminOrgsTab from '$lib/components/admin/AdminOrgsTab.svelte';
  import AdminModelsTab from '$lib/components/admin/AdminModelsTab.svelte';
  import AdminPaymentsTab from '$lib/components/admin/AdminPaymentsTab.svelte';
  import AdminPricingTab from '$lib/components/admin/AdminPricingTab.svelte';

  let activeTab = $state('users');

  // Derive app title from productInfo for <title> tag
  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  // Redirect non-admin users immediately
  $effect(() => {
    if ($currentUser && !$isAdmin) {
      goto('/app/create', { replaceState: true });
    }
  });
</script>

<svelte:head>
  <title>Admin — {appTitle}</title>
</svelte:head>

<div class="admin-page">
  <AdminTabBar {activeTab} ontabchange={(id) => (activeTab = id)} />

  <div class="admin-content">
    {#if activeTab === 'users'}
      <AdminUsersTab />
    {:else if activeTab === 'orgs'}
      <AdminOrgsTab />
    {:else if activeTab === 'models'}
      <AdminModelsTab />
    {:else if activeTab === 'payments'}
      <AdminPaymentsTab />
    {:else if activeTab === 'pricing'}
      <AdminPricingTab />
    {/if}
  </div>
</div>

<style>
  .admin-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .admin-content {
    flex: 1;
    overflow-y: auto;
  }
</style>
