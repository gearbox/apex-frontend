<script lang="ts">
  import {
    createMutation as createSvelteMutation,
    createQuery,
    useQueryClient,
  } from '@tanstack/svelte-query';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { ChevronDown, ChevronRight, Folder, FolderPlus, Pencil, Trash2 } from 'lucide-svelte';
  import {
    createProjectMutationOptions,
    deleteProjectMutationOptions,
    projectsListQueryOptions,
    renameProjectMutationOptions,
  } from '$lib/queries/library';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import EntityNameDialog from '$lib/components/shared/EntityNameDialog.svelte';
  import { activeProject } from '$lib/stores/activeProject.svelte';
  import { addToast } from '$lib/stores/toasts';
  import {
    getActiveLibraryProjectId,
    getProjectNavigationTarget,
    isLibraryUrl,
  } from '$lib/utils/projectNavigation';
  import * as m from '$paraglide/messages';

  type ProjectNavSurface = 'desktop' | 'mobile';

  let {
    surface,
    onclose,
  }: {
    surface: ProjectNavSurface;
    onclose?: () => void;
  } = $props();

  const queryClient = useQueryClient();
  const projectsQuery = createQuery(() => projectsListQueryOptions());
  const createMutation = createSvelteMutation(() => createProjectMutationOptions(queryClient));
  const renameMutation = createSvelteMutation(() => renameProjectMutationOptions(queryClient));
  const deleteMutation = createSvelteMutation(() => deleteProjectMutationOptions(queryClient));

  let expanded = $state(true);
  let editing = $state<{ id: string | null; name: string } | null>(null);
  let deleteTarget = $state<{ id: string; name: string } | null>(null);

  const projects = $derived(projectsQuery.data?.items ?? []);
  const activeProjectId = $derived(getActiveLibraryProjectId($page.url));
  const isLibraryRoute = $derived(isLibraryUrl($page.url));

  function choose(projectId: string | null) {
    // Close the mobile sheet before navigation so neither its backdrop nor focus lock remains
    // around while the Library route is rendered.
    onclose?.();
    activeProject.set(projectId);

    const target = getProjectNavigationTarget($page.url, projectId);
    goto(target.href, {
      replaceState: target.replaceState,
      keepFocus: true,
      noScroll: true,
    });
  }

  function startCreate() {
    editing = { id: null, name: '' };
  }

  function startRename(project: { id: string; name: string }) {
    editing = { id: project.id, name: project.name };
  }

  async function saveProject() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;

    const isRename = editing.id !== null;
    try {
      if (editing.id) {
        await renameMutation.mutateAsync({ projectId: editing.id, patch: { name } });
      } else {
        const created = await createMutation.mutateAsync({ name });
        editing = null;
        choose(created.id);
        return;
      }
      editing = null;
    } catch {
      addToast({
        type: 'error',
        message: isRename ? m.library_project_rename_error() : m.library_project_create_error(),
      });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const deletedProject = deleteTarget;
    try {
      await deleteMutation.mutateAsync(deletedProject.id);
      deleteTarget = null;
      if (activeProjectId === deletedProject.id || activeProject.id === deletedProject.id) {
        choose(null);
      }
    } catch {
      addToast({ type: 'error', message: m.library_project_delete_error() });
    }
  }
</script>

{#snippet allAssets()}
  <button
    type="button"
    data-testid="all-assets-project-action"
    onclick={() => choose(null)}
    class="project-choice {isLibraryRoute && activeProjectId === null
      ? 'project-choice-active'
      : ''}"
  >
    <Folder size={surface === 'mobile' ? 17 : 14} />
    <span class="min-w-0 flex-1 truncate">{m.library_projects_all()}</span>
  </button>
{/snippet}

{#snippet projectRows()}
  {#if projectsQuery.isLoading}
    <div class="space-y-2 px-2 py-2" aria-label={m.common_loading()}>
      <div class="h-3 animate-pulse rounded bg-surface-hover"></div>
      <div class="h-3 w-3/4 animate-pulse rounded bg-surface-hover"></div>
    </div>
  {:else if projectsQuery.isError}
    <div class="px-2 py-3 text-xs text-danger" role="alert">
      <p>{m.library_load_error()}</p>
      <button
        type="button"
        class="mt-1 font-medium text-accent hover:underline"
        onclick={() => projectsQuery.refetch()}
      >
        {m.common_retry()}
      </button>
    </div>
  {:else}
    {#each projects as project (project.id)}
      <div class="project-row group">
        <button
          type="button"
          onclick={() => choose(project.id)}
          class="project-choice {isLibraryRoute && activeProjectId === project.id
            ? 'project-choice-active'
            : ''}"
        >
          <Folder size={surface === 'mobile' ? 17 : 14} />
          <span class="min-w-0 flex-1 truncate">{project.name}</span>
          <span aria-hidden="true" class="shrink-0 text-[10px] tabular-nums text-text-dim">
            {project.asset_count}
          </span>
        </button>
        <button
          type="button"
          class="project-action {surface === 'mobile'
            ? 'project-action-mobile'
            : 'project-action-desktop'}"
          aria-label={`${m.library_project_rename()}: ${project.name}`}
          onclick={(event) => {
            event.stopPropagation();
            startRename(project);
          }}
        >
          <Pencil size={surface === 'mobile' ? 16 : 13} />
        </button>
        <button
          type="button"
          class="project-action project-action-delete {surface === 'mobile'
            ? 'project-action-mobile'
            : 'project-action-desktop'}"
          aria-label={`${m.common_delete()}: ${project.name}`}
          onclick={(event) => {
            event.stopPropagation();
            deleteTarget = project;
          }}
        >
          <Trash2 size={surface === 'mobile' ? 16 : 13} />
        </button>
      </div>
    {/each}
  {/if}
{/snippet}

{#if surface === 'desktop'}
  <section class="desktop-project-nav" aria-label={m.library_projects()}>
    <div class="desktop-project-header">
      <button
        type="button"
        class="desktop-project-toggle"
        onclick={() => (expanded = !expanded)}
        aria-expanded={expanded}
      >
        {#if expanded}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
        <span>{m.library_projects()}</span>
      </button>
      <button
        type="button"
        class="desktop-project-create"
        onclick={startCreate}
        aria-label={m.library_project_new()}
      >
        <FolderPlus size={15} />
      </button>
    </div>
    {#if expanded}
      <div class="desktop-project-all-assets">{@render allAssets()}</div>
      <div
        class="desktop-project-list"
        data-testid="desktop-project-scroll-region"
        aria-label={m.library_projects()}
      >
        {@render projectRows()}
      </div>
    {/if}
  </section>
{:else}
  <section class="mobile-project-nav" aria-labelledby="mobile-projects-heading">
    <div class="mobile-project-header">
      <h2 id="mobile-projects-heading" class="text-base font-semibold text-text">
        {m.library_projects()}
      </h2>
      <button
        type="button"
        class="flex h-10 w-10 items-center justify-center rounded-xl text-accent hover:bg-accent/10"
        onclick={startCreate}
        aria-label={m.library_project_new()}
      >
        <FolderPlus size={19} />
      </button>
    </div>
    <div class="mobile-project-all-assets">{@render allAssets()}</div>
    <div class="mobile-project-list" aria-label={m.library_projects()}>{@render projectRows()}</div>
  </section>
{/if}

{#if editing}
  <EntityNameDialog
    title={editing.id ? m.library_project_rename() : m.library_project_new()}
    inputLabel={m.library_project_name()}
    inputId="project-name"
    bind:value={editing.name}
    maxLength={120}
    cancelLabel={m.common_cancel()}
    submitLabel={editing.id ? m.common_save() : m.library_project_create()}
    isPending={createMutation.isPending || renameMutation.isPending}
    onsubmit={() => void saveProject()}
    oncancel={() => (editing = null)}
  />
{/if}

{#if deleteTarget}
  <ConfirmDeleteModal
    title={m.library_project_delete_title()}
    message={m.library_project_delete_confirm()}
    isPending={deleteMutation.isPending}
    onconfirm={confirmDelete}
    oncancel={() => (deleteTarget = null)}
  />
{/if}

<style>
  .desktop-project-nav {
    margin: 2px 0 6px 12px;
    min-width: 0;
    border-left: 1px solid var(--apex-border);
    padding-left: 8px;
  }

  .desktop-project-header,
  .mobile-project-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }

  .desktop-project-header {
    min-height: 32px;
  }

  .desktop-project-toggle {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    padding: 6px 4px;
    color: var(--apex-text-muted);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    text-align: left;
    cursor: pointer;
  }

  .desktop-project-toggle:hover {
    background: var(--apex-surface-hover);
    color: var(--apex-text);
  }

  .desktop-project-create {
    display: flex;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--apex-accent);
    cursor: pointer;
  }

  .desktop-project-create:hover {
    background: var(--apex-accent-glow);
  }

  .desktop-project-all-assets {
    margin: 2px 0;
  }

  .desktop-project-list {
    max-height: 216px; /* six 36px project rows */
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .project-row {
    display: flex;
    height: 36px;
    min-width: 0;
    align-items: center;
    gap: 1px;
    border-radius: 7px;
  }

  .project-row:hover {
    background: var(--apex-surface-hover);
  }

  .project-choice {
    display: flex;
    height: 100%;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 7px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    padding: 0 8px;
    color: var(--apex-text-muted);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }

  .project-choice:hover {
    color: var(--apex-text);
  }

  .project-choice-active {
    background: var(--apex-accent-glow);
    color: var(--apex-accent);
  }

  .desktop-project-all-assets .project-choice {
    height: 32px;
  }

  .project-action {
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--apex-text-dim);
    cursor: pointer;
  }

  .project-action:hover {
    background: var(--apex-bg);
    color: var(--apex-text);
  }

  .project-action-delete:hover {
    background: color-mix(in srgb, var(--apex-danger) 10%, transparent);
    color: var(--apex-danger);
  }

  .project-action-desktop {
    display: none;
    width: 24px;
    height: 24px;
  }

  .project-row:hover .project-action-desktop,
  .project-row:focus-within .project-action-desktop {
    display: flex;
  }

  .mobile-project-nav {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
  }

  .mobile-project-header {
    flex: 0 0 auto;
    padding: 0 20px 10px;
  }

  .mobile-project-all-assets {
    flex: 0 0 auto;
    padding: 0 12px 8px;
  }

  .mobile-project-all-assets .project-choice {
    height: 48px;
    padding: 0 12px;
    font-size: 14px;
  }

  .mobile-project-list {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 12px;
  }

  .mobile-project-list .project-row {
    height: 52px;
    gap: 4px;
  }

  .mobile-project-list .project-choice {
    padding: 0 12px;
    font-size: 14px;
  }

  .project-action-mobile {
    display: flex;
    width: 40px;
    height: 40px;
  }
</style>
