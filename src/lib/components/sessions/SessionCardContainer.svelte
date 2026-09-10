<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import type { GpuSessionListItemResponse } from '$lib/api/sessions';
  import type { ProvidersResponse } from '$lib/queries/providers';
  import { isSSEFallback } from '$lib/stores/eventStream';
  import { sessionDetailQueryOptions } from '$lib/queries/sessions';
  import {
    eligibleAttachModels,
    type ModelProvisioningHints,
  } from '$lib/utils/deploymentEligibility';
  import SessionCard from './SessionCard.svelte';

  interface Props {
    session: GpuSessionListItemResponse;
    providers: ProvidersResponse | undefined;
    modelNames?: Record<string, string>;
    provisioningHints?: Map<string, ModelProvisioningHints>;
    onStop: (id: string) => void;
  }
  let {
    session,
    providers,
    modelNames = {},
    provisioningHints = new Map(),
    onStop,
  }: Props = $props();
  const queryClient = useQueryClient();
  const detailQuery = createQuery(() =>
    sessionDetailQueryOptions(queryClient, session.id, {
      enabled: true,
      refetchInterval: $isSSEFallback ? 8000 : false,
    }),
  );
  const detail = $derived(detailQuery.data);
  // A query retains its last good `data` while a background refetch fails — `isError` can be true
  // at the same time as usable cached data. Cached data must win: a transient poll/refetch failure
  // must not blank out an already-rendered card. The error state is reserved for "no usable detail
  // data was ever obtained".
  const detailState = $derived(detail ? 'loaded' : detailQuery.isError ? 'error' : 'loading');
  const providerList = $derived(providers?.providers ?? []);
  const attachable = $derived(
    detail ? eligibleAttachModels(providerList, detail.deployments ?? []) : [],
  );
</script>

<SessionCard
  session={detail ?? session}
  {modelNames}
  attachableModels={attachable}
  {provisioningHints}
  {detailState}
  onDetailRetry={() => detailQuery.refetch()}
  {onStop}
/>
