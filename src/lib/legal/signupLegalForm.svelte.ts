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
  // Keep a completed, exact document set usable while TanStack Query refreshes `/current` in the
  // background. A stale submission is rejected by the API and handled by refresh(), whereas
  // treating every refresh as an initial load can leave the form permanently disabled.
  const loading = $derived(currentLegalQuery.isPending || !exactDocuments.ready);
  const canSubmit = $derived(
    !currentLegalQuery.isPending &&
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
