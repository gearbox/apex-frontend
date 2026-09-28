import { createQuery } from '@tanstack/svelte-query';
import LegalAcceptanceFields from '$lib/components/legal/LegalAcceptanceFields.svelte';
import { createExactDocuments } from '$lib/legal/exactDocuments.svelte';
import { currentLegalQueryOptions } from '$lib/queries/legal';

/**
 * Shared legal gate used by password registration and OAuth signup.  It intentionally owns the
 * query, immutable exact-document prefetch, acceptance reset, and stale-version refresh as one
 * unit so both account creation paths submit the exact same evidence.
 */
export function createSignupLegalForm() {
  const state = $state<{
    valid: boolean;
    acceptanceFields: LegalAcceptanceFields | undefined;
  }>({ valid: true, acceptanceFields: undefined });

  const currentLegalQuery = createQuery(() => currentLegalQueryOptions());
  const exactDocuments = createExactDocuments(() => currentLegalQuery.data, {
    onPayloadChange: () => {
      state.acceptanceFields?.reset();
      state.valid = (currentLegalQuery.data?.length ?? 0) === 0;
    },
  });

  const currentLegal = $derived(currentLegalQuery.data ?? []);
  const loading = $derived(
    currentLegalQuery.isPending || currentLegalQuery.isFetching || !exactDocuments.ready,
  );
  const canSubmit = $derived(
    !currentLegalQuery.isPending &&
      !currentLegalQuery.isFetching &&
      !currentLegalQuery.isError &&
      !exactDocuments.error &&
      exactDocuments.ready &&
      state.valid,
  );

  async function refresh(): Promise<void> {
    state.acceptanceFields?.reset();
    state.valid = currentLegal.length === 0;
    await currentLegalQuery.refetch();
    await exactDocuments.reload();
  }

  return {
    state,
    currentLegalQuery,
    exactDocuments,
    get currentLegal() {
      return currentLegal;
    },
    get loading() {
      return loading;
    },
    get canSubmit() {
      return canSubmit;
    },
    refresh,
  };
}
