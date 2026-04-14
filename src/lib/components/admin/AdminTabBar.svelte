<script lang="ts">
  import { Users, Building2, Cpu, CreditCard, Coins, ShieldCheck } from 'lucide-svelte';

  interface TabDef {
    id: string;
    label: string;
    icon: typeof Users;
  }

  interface Props {
    activeTab: string;
    ontabchange: (id: string) => void;
    showManageTab: boolean;
  }

  let { activeTab, ontabchange, showManageTab }: Props = $props();

  const baseTabs: TabDef[] = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'orgs', label: 'Organizations', icon: Building2 },
    { id: 'models', label: 'Models', icon: Cpu },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'pricing', label: 'Pricing', icon: Coins },
  ];

  const manageTabs: TabDef[] = [
    { id: 'admins', label: 'Admins', icon: ShieldCheck },
  ];

  const tabs = $derived(showManageTab ? [...baseTabs, ...manageTabs] : baseTabs);
</script>

<div class="tab-bar" role="tablist" aria-label="Admin sections">
  {#each tabs as tab (tab.id)}
    {@const isActive = activeTab === tab.id}
    <button
      role="tab"
      aria-selected={isActive}
      aria-label={tab.label}
      class="tab-btn"
      class:active={isActive}
      onclick={() => ontabchange(tab.id)}
    >
      <span class="tab-icon"><tab.icon size={16} strokeWidth={isActive ? 2 : 1.75} /></span>
      <span class="tab-label">{tab.label}</span>
    </button>
  {/each}
</div>

<style>
  .tab-bar {
    display: flex;
    background: var(--apex-surface);
    border-bottom: 1px solid var(--apex-border);
    overflow-x: auto;
    white-space: nowrap;
    -ms-overflow-style: none;
    scrollbar-width: none;
    flex-shrink: 0;
  }

  .tab-bar::-webkit-scrollbar {
    display: none;
  }

  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 500;
    color: var(--apex-text-muted);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px;
  }

  .tab-btn:hover:not(.active) {
    color: var(--apex-text);
    background: var(--apex-surface-hover);
  }

  .tab-btn.active {
    color: var(--apex-accent);
    font-weight: 700;
    border-bottom-color: var(--apex-accent);
  }

  .tab-icon {
    display: flex;
    flex-shrink: 0;
  }

  @media (max-width: 767px) {
    .tab-btn {
      padding: 10px 14px;
    }

    .tab-label {
      display: none;
    }

    .tab-icon {
      font-size: 20px;
    }

    .tab-btn :global(svg) {
      width: 20px;
      height: 20px;
    }
  }
</style>
