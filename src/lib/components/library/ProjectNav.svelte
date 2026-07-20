<script lang="ts">
  import {
    createMutation as createSvelteMutation,
    createQuery,
    useQueryClient,
  } from '@tanstack/svelte-query';
  import { ChevronDown, ChevronRight, Folder, FolderPlus, Pencil, Trash2, X } from 'lucide-svelte';
  import {
    createProjectMutationOptions,
    deleteProjectMutationOptions,
    projectsListQueryOptions,
    renameProjectMutationOptions,
  } from '$lib/queries/library';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import { addToast } from '$lib/stores/toasts';
  import * as m from '$paraglide/messages';

  let {
    activeProjectId,
    onActiveChange,
  }: {
    activeProjectId: string | null;
    onActiveChange: (projectId: string | null) => void;
  } = $props();

  const queryClient = useQueryClient();
  const projectsQuery = createQuery(() => projectsListQueryOptions());
  const createMutation = createSvelteMutation(() => createProjectMutationOptions(queryClient));
  const renameMutation = createSvelteMutation(() => renameProjectMutationOptions(queryClient));
  const deleteMutation = createSvelteMutation(() => deleteProjectMutationOptions(queryClient));

  let expanded = $state(true);
  let mobileOpen = $state(false);
  let editing = $state<{ id: string | null; name: string } | null>(null);
  let deleteTarget = $state<{ id: string; name: string } | null>(null);

  const projects = $derived(projectsQuery.data?.items ?? []);

  function choose(projectId: string | null) {
    onActiveChange(projectId);
    mobileOpen = false;
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
        choose(created.id);
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
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      if (activeProjectId === deleteTarget.id) choose(null);
      deleteTarget = null;
    } catch {
      addToast({ type: 'error', message: m.library_project_delete_error() });
    }
  }
</script>

{#snippet projectList()}
  <button
    type="button"
    onclick={() => choose(null)}
    class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium transition-colors {activeProjectId ===
    null
      ? 'bg-accent/15 text-accent'
      : 'text-text-muted hover:bg-surface-hover hover:text-text'}"
  >
    <Folder size={14} />
    <span class="min-w-0 flex-1 truncate">{m.library_projects_all()}</span>
  </button>

  {#if projectsQuery.isLoading}
    <div class="space-y-2 px-2 py-2">
      <div class="h-3 animate-pulse rounded bg-surface-hover"></div>
      <div class="h-3 w-3/4 animate-pulse rounded bg-surface-hover"></div>
    </div>
  {:else}
    {#each projects as project (project.id)}
      <div class="group flex items-center gap-1 rounded-lg pr-1 hover:bg-surface-hover">
        <button
          type="button"
          onclick={() => choose(project.id)}
          class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium transition-colors {activeProjectId ===
          project.id
            ? 'bg-accent/15 text-accent'
            : 'text-text-muted hover:text-text'}"
        >
          <Folder size={14} />
          <span class="min-w-0 flex-1 truncate">{project.name}</span>
          <span aria-hidden="true" class="text-[10px] tabular-nums text-text-dim"
            >{project.asset_count}</span
          >
        </button>
        <button
          type="button"
          class="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-text-dim hover:bg-bg hover:text-text group-hover:flex focus:flex"
          aria-label={`${m.library_project_rename()}: ${project.name}`}
          onclick={(event) => {
            event.stopPropagation();
            startRename(project);
          }}
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          class="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-text-dim hover:bg-danger/10 hover:text-danger group-hover:flex focus:flex"
          aria-label={`${m.common_delete()}: ${project.name}`}
          onclick={(event) => {
            event.stopPropagation();
            deleteTarget = project;
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    {/each}
  {/if}
{/snippet}

<!-- Desktop sidebar section -->
<aside
  class="hidden w-52 shrink-0 self-start rounded-xl border border-border bg-surface/60 p-2 md:block"
>
  <div class="flex items-center gap-1 px-1 py-1">
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold text-text"
      onclick={() => (expanded = !expanded)}
      aria-expanded={expanded}
    >
      {#if expanded}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
      {m.library_projects()}
    </button>
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-md text-accent hover:bg-accent/10"
      onclick={startCreate}
      aria-label={m.library_project_new()}
    >
      <FolderPlus size={15} />
    </button>
  </div>
  {#if expanded}
    <div class="mt-1 space-y-0.5">{@render projectList()}</div>
  {/if}
</aside>

<!-- Mobile selector / drawer -->
<div class="md:hidden">
  <button
    type="button"
    class="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted"
    onclick={() => (mobileOpen = true)}
  >
    <Folder size={13} />
    {activeProjectId
      ? projects.find((project) => project.id === activeProjectId)?.name
      : m.library_projects_all()}
  </button>

  {#if mobileOpen}
    <div
      class="fixed inset-0 z-[160] bg-black/50"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) mobileOpen = false;
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={m.library_projects()}
        tabindex="-1"
        class="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-text">{m.library_projects()}</h2>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-accent hover:bg-accent/10"
              onclick={startCreate}
              aria-label={m.library_project_new()}
            >
              <FolderPlus size={17} />
            </button>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover"
              onclick={() => (mobileOpen = false)}
              aria-label={m.common_close()}
            >
              <X size={17} />
            </button>
          </div>
        </div>
        <div class="space-y-0.5">{@render projectList()}</div>
      </div>
    </div>
  {/if}
</div>

{#if editing}
  <div
    class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
    role="presentation"
  >
    <form
      class="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl"
      onsubmit={(event) => {
        event.preventDefault();
        saveProject();
      }}
    >
      <div class="mb-4 flex items-center gap-2">
        <Pencil size={17} class="text-accent" />
        <h2 class="text-sm font-semibold text-text">
          {editing.id ? m.library_project_rename() : m.library_project_new()}
        </h2>
      </div>
      <label class="mb-1 block text-xs font-medium text-text-muted" for="project-name"
        >{m.library_project_name()}</label
      >
      <input
        id="project-name"
        bind:value={editing.name}
        required
        maxlength="120"
        class="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
      />
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-xs font-semibold text-text-muted hover:bg-surface-hover"
          onclick={() => (editing = null)}
        >
          {m.common_cancel()}
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending || renameMutation.isPending}
          class="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {editing.id ? m.common_save() : m.library_project_create()}
        </button>
      </div>
    </form>
  </div>
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
