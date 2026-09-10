<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { isSSEFallback } from '$lib/stores/eventStream';
  import { addToast } from '$lib/stores/toasts';
  import { parseApiError } from '$lib/api/errors';
  import { sessionsListQueryOptions, startSessionMutationOptions } from '$lib/queries/sessions';
  import { providerKeys, providersQueryOptions } from '$lib/queries/providers';
  import StartSessionPanel from '$lib/components/sessions/StartSessionPanel.svelte';
  import SessionCard from '$lib/components/sessions/SessionCard.svelte';
  import StopSessionModal from '$lib/components/sessions/StopSessionModal.svelte';
  import { productInfo } from '$lib/stores/product';
  import * as m from '$paraglide/messages';

  const queryClient = useQueryClient();

  // App title
  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  // ── Providers query (to derive on-demand models + availability)
  const providerQuery = createQuery(() => providersQueryOptions($isSSEFallback ? 8000 : false));

  const onDemandModels = $derived(
    (providerQuery.data?.providers ?? []).flatMap((provider) =>
      provider.provisioning_mode !== 'on_demand'
        ? []
        : provider.models
            .filter(
              (model) => provider.available && model.is_enabled && model.runtime?.state === 'none',
            )
            .map((model) => ({
              model_key: model.model_key,
              name: model.name,
              available: provider.available,
            })),
    ),
  );

  // ── Sessions list query (poll only when SSE is in fallback mode)
  const sessionsQuery = createQuery(() =>
    sessionsListQueryOptions(false, $isSSEFallback ? 8000 : false),
  );

  const sessions = $derived(sessionsQuery.data ?? []);

  // ── Start mutation
  const startMutation = createMutation(() => startSessionMutationOptions(queryClient));

  function handleStart(model: string) {
    startMutation.mutate(model as never, {
      onError: (err) => {
        const apiErr = parseApiError(err, 0);
        if (apiErr.error === 'session_already_exists') {
          addToast({ type: 'warning', message: m.session_already_exists() });
        } else {
          addToast({ type: 'error', message: apiErr.message || 'Failed to start session' });
        }
      },
    });
  }

  // ── Stop modal state
  let stopModalSessionId = $state<string | null>(null);

  function openStopModal(id: string) {
    stopModalSessionId = id;
  }

  function handleStopped() {
    stopModalSessionId = null;
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: providerKeys.catalog() });
  }

  function closeStopModal() {
    stopModalSessionId = null;
  }
</script>

<svelte:head>
  <title>{m.sessions_title()} — {appTitle}</title>
</svelte:head>

<div class="sessions-page">
  <div class="page-header">
    <h1 class="page-title">{m.sessions_title()}</h1>
    <p class="page-subtitle">{m.sessions_subtitle()}</p>
  </div>

  <StartSessionPanel {onDemandModels} starting={startMutation.isPending} onStart={handleStart} />

  {#if sessions.length > 0}
    <div class="sessions-list">
      {#each sessions as session (session.id)}
        <SessionCard {session} onStop={openStopModal} />
      {/each}
    </div>
  {:else if !sessionsQuery.isPending}
    <p class="sessions-empty">{m.sessions_empty()}</p>
  {/if}
</div>

{#if stopModalSessionId}
  <StopSessionModal
    sessionId={stopModalSessionId}
    onStopped={handleStopped}
    onClose={closeStopModal}
  />
{/if}

<style>
  .sessions-page {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
    max-width: 640px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .page-title {
    font-size: 22px;
    font-weight: 800;
    color: var(--apex-text);
    margin: 0;
  }

  .page-subtitle {
    font-size: 13px;
    color: var(--apex-text-muted);
    margin: 0;
  }

  .sessions-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sessions-empty {
    font-size: 14px;
    color: var(--apex-text-muted);
    text-align: center;
    padding: 24px 0;
  }
</style>
