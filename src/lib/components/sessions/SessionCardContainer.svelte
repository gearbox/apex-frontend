<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import type { GpuSessionListItemResponse } from '$lib/api/sessions';
  import type { ProvidersResponse } from '$lib/queries/providers';
  import { isSSEFallback } from '$lib/stores/eventStream';
  import { sessionDetailQueryOptions } from '$lib/queries/sessions';
  import { eligibleAttachModels, modelNameByType } from '$lib/utils/deploymentEligibility';
  import SessionCard from './SessionCard.svelte';

  interface Props {
    session: GpuSessionListItemResponse;
    providers: ProvidersResponse | undefined;
    onStop: (id: string) => void;
  }
  let { session, providers, onStop }: Props = $props();
  const queryClient = useQueryClient();
  const detailQuery = createQuery(() =>
    sessionDetailQueryOptions(queryClient, session.id, {
      enabled: true,
      refetchInterval: $isSSEFallback ? 8000 : false,
    }),
  );
  const detail = $derived(detailQuery.data);
  const providerList = $derived(providers?.providers ?? []);
  const names = $derived(Object.fromEntries(modelNameByType(providerList)));
  const attachable = $derived(
    detail ? eligibleAttachModels(providerList, detail.deployments ?? []) : [],
  );
</script>

<SessionCard
  session={detail ?? session}
  modelNames={names}
  attachableModels={attachable}
  {onStop}
/>
