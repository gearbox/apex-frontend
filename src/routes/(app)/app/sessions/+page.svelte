<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { isSSEFallback } from '$lib/stores/eventStream';
  import { addToast } from '$lib/stores/toasts';
  import { parseApiError } from '$lib/api/errors';
  import apiClient from '$lib/api/client';
  import {
    sessionsListQueryOptions,
    sessionDetailQueryOptions,
    startSessionMutationOptions,
    stopSessionMutationOptions,
  } from '$lib/queries/sessions';
  import { isProvisioningStatus } from '$lib/utils/sessionState';
  import StartSessionPanel from '$lib/components/sessions/StartSessionPanel.svelte';
  import SessionCard from '$lib/components/sessions/SessionCard.svelte';
  import StopSessionModal from '$lib/components/sessions/StopSessionModal.svelte';
  import { productInfo } from '$lib/stores/product';
  import * as m from '$paraglide/messages';

  const queryClient = useQueryClient();

  // App title
  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  // ── Providers query (to derive on-demand models + availability)
  const providerQuery = createQuery(() => ({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data } = await apiClient.GET('/v1/providers');
      return data ?? { providers: [], user_context: null };
    },
    staleTime: 60 * 60 * 1000,
  }));

  const onDemandModels = $derived(
    (providerQuery.data?.providers ?? [])
      .filter((p) => p.provisioning_mode === 'on_demand')
      .flatMap((p) =>
        p.models.map((model) => ({
          model_key: model.model_key,
          name: model.name,
          available: p.available,
        })),
      ),
  );

  // ── Sessions list query (poll only when SSE is in fallback mode)
  const sessionsQuery = createQuery(() =>
    sessionsListQueryOptions(false, $isSSEFallback ? 8000 : false),
  );

  const sessions = $derived(sessionsQuery.data ?? []);

  // ── Find any currently-provisioning session (first one wins)
  const provisioningSession = $derived(
    sessions.find((s) => isProvisioningStatus(s.status)) ?? null,
  );
  const isProvisioning = $derived(provisioningSession !== null);

  // ── Single-session detail poll while provisioning (surfaces provisioning_progress)
  const sessionDetailQuery = createQuery(() =>
    sessionDetailQueryOptions(provisioningSession?.id ?? '', {
      enabled: isProvisioning && !!provisioningSession?.id,
      refetchInterval: isProvisioning ? 3000 : false,
    }),
  );

  // Compute progress percentage from provisioning_progress bytes data
  const provisioningProgress = $derived((): number | null => {
    const detail = sessionDetailQuery.data;
    if (!detail) return null;
    const pp = detail.provisioning_progress as Record<string, unknown> | null | undefined;
    if (!pp) return null;
    const done = typeof pp['bytes_done'] === 'number' ? pp['bytes_done'] : null;
    const total = typeof pp['bytes_total'] === 'number' ? pp['bytes_total'] : null;
    if (done === null || total === null || total === 0) return null;
    return Math.round((done / total) * 100);
  });

  // Merge detail data into the provisioning session card
  function getProgress(sessionId: string): number | null {
    if (provisioningSession?.id !== sessionId) return null;
    return provisioningProgress();
  }

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
    queryClient.invalidateQueries({ queryKey: ['providers'] });
  }

  function closeStopModal() {
    stopModalSessionId = null;
  }

  // ── Track which sessions are in the stop-pending state
  const stopMutation = createMutation(() => stopSessionMutationOptions(queryClient));
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
        <SessionCard
          {session}
          onStop={openStopModal}
          stopping={stopMutation.isPending && stopMutation.variables === session.id}
          provisioningProgress={getProgress(session.id)}
        />
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
