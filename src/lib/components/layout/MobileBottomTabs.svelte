<script lang="ts">
  import { page } from '$app/stores';
  import {
    moreSheetOpen,
    openMoreSheet,
    openProjectsSheet,
    projectsSheetOpen,
  } from '$lib/stores/ui';
  import { getActiveLibraryProjectId, isLibraryUrl } from '$lib/utils/projectNavigation';
  import * as m from '$paraglide/messages';
  import { Folder, Plus, Images, MoreVertical, Server } from '@lucide/svelte';

  const isCreateActive = $derived($page.url.pathname.startsWith('/app/create'));
  const isSessionsActive = $derived($page.url.pathname.startsWith('/app/sessions'));
  const isLibraryActive = $derived(isLibraryUrl($page.url));
  const activeLibraryProjectId = $derived(getActiveLibraryProjectId($page.url));
</script>

<nav class="btm-tabs chrome-no-select">
  <a
    href="/app/create"
    class="btm-tab"
    class:active={isCreateActive}
    aria-current={isCreateActive ? 'page' : undefined}
  >
    <span class="btm-tab-icon">
      <Plus size={22} strokeWidth={isCreateActive ? 2.25 : 1.75} />
    </span>
    <span class="btm-tab-label">{m.nav_create()}</span>
  </a>

  <a
    href="/app/sessions"
    class="btm-tab"
    class:active={isSessionsActive}
    aria-current={isSessionsActive ? 'page' : undefined}
  >
    <span class="btm-tab-icon">
      <Server size={22} strokeWidth={isSessionsActive ? 2.25 : 1.75} />
    </span>
    <span class="btm-tab-label">{m.nav_sessions()}</span>
  </a>

  <div class="btm-library-slot" class:active={isLibraryActive} data-testid="mobile-library-slot">
    <a
      href="/app/library"
      class="btm-library-action btm-library-action-library"
      aria-label={m.library_title()}
      aria-current={isLibraryActive ? 'page' : undefined}
    >
      <Images size={22} strokeWidth={isLibraryActive ? 2.25 : 1.75} />
    </a>
    <button
      type="button"
      onclick={openProjectsSheet}
      class="btm-library-action btm-library-action-projects"
      class:project-active={activeLibraryProjectId !== null}
      aria-label={m.library_projects()}
      aria-expanded={$projectsSheetOpen}
      aria-controls="mobile-projects-sheet"
      data-testid="mobile-library-projects-action"
    >
      <Folder
        size={22}
        strokeWidth={activeLibraryProjectId !== null || $projectsSheetOpen ? 2.25 : 1.75}
      />
    </button>
    <span class="btm-tab-label btm-library-label" aria-hidden="true">{m.library_title()}</span>
  </div>

  <button
    type="button"
    onclick={openMoreSheet}
    class="btm-tab"
    class:active={$moreSheetOpen}
    aria-expanded={$moreSheetOpen}
    aria-controls="mobile-more-sheet"
  >
    <span class="btm-tab-icon">
      <MoreVertical size={22} strokeWidth={1.75} />
    </span>
    <span class="btm-tab-label">{m.nav_more()}</span>
  </button>
</nav>

<style>
  .btm-tabs {
    display: flex;
    border-top: 1px solid var(--apex-border);
    background: var(--apex-bg);
    padding: 6px 0 max(6px, env(safe-area-inset-bottom));
    position: relative;
    z-index: 50;
  }

  .btm-tab {
    flex: 1 1 0;
    min-width: 0;
    min-height: 46px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 0;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--apex-text-dim);
    font-family: inherit;
    font-size: 10px;
    font-weight: 500;
    transition: color 0.15s;
    text-decoration: none;
  }

  .btm-tab.active {
    color: var(--apex-accent);
    font-weight: 700;
  }

  .btm-tab-icon {
    position: relative;
    display: flex;
  }

  .btm-tab-label {
    line-height: 1;
  }

  .btm-library-slot {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    min-height: 46px;
  }

  .btm-library-action {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    width: 50%;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    padding: 0 0 13px;
    color: var(--apex-text-dim);
    cursor: pointer;
    text-decoration: none;
    transition:
      color 0.15s,
      opacity 0.15s;
  }

  .btm-library-action-library {
    left: 0;
  }

  .btm-library-action-projects {
    right: 0;
  }

  .btm-library-action-projects::before {
    position: absolute;
    top: 8px;
    bottom: 16px;
    left: 0;
    width: 1px;
    background: var(--apex-border);
    content: '';
  }

  .btm-library-slot.active .btm-library-action-library,
  .btm-library-slot.active .btm-library-label {
    color: var(--apex-accent);
    font-weight: 700;
  }

  .btm-library-action-projects.project-active {
    color: var(--apex-accent);
    opacity: 0.72;
  }

  .btm-library-label {
    position: absolute;
    right: 0;
    bottom: 6px;
    left: 0;
    z-index: 1;
    color: var(--apex-text-dim);
    font-size: 10px;
    font-weight: 500;
    pointer-events: none;
    text-align: center;
    transition: color 0.15s;
  }
</style>
