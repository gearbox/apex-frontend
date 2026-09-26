import { untrack } from 'svelte';
import { useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import type { LegalDocumentMeta } from '$lib/api/legal';
import { legalDocumentQueryOptions } from '$lib/queries/legal';

export interface ExactDocuments {
  /** Every body in the latest `/current` payload is cached at its exact version. */
  readonly ready: boolean;
  /** Prefetching the latest payload failed; a submission must stay disabled. */
  readonly error: boolean;
  /** Prefetch the latest payload again, e.g. after a Retry that returned the same `/current`. */
  reload(): Promise<void>;
}

/**
 * Loads immutable, exact-version copies of the current legal set before an acceptance can be
 * submitted, so the text the person reads matches the metadata echoed back to the API.
 *
 * Must be created during component initialisation (it owns an `$effect`). A result for a payload
 * that a later `/current` response has superseded never flips `ready` or `error`.
 *
 * Payloads are compared by content, not identity: a query result hands out a new reference on
 * every update, and a background refetch of an unchanged set must not reset the form.
 */
export interface ExactDocumentsOptions {
  /** Defaults to the component's client; pass one explicitly outside a component tree. */
  queryClient?: QueryClient;
  /**
   * Runs when `/current` changes content (not on the first payload). A new set always needs a
   * fresh, explicit acknowledgement, so callers clear their consent checkboxes here.
   */
  onPayloadChange?: () => void;
}

export function createExactDocuments(
  getCurrent: () => LegalDocumentMeta[] | undefined,
  { queryClient = useQueryClient(), onPayloadChange }: ExactDocumentsOptions = {},
): ExactDocuments {
  let ready = $state(false);
  let error = $state(false);
  let generation = 0;
  let loadedKey: string | null = null;
  const payloadKey = $derived(keyOf(getCurrent()));

  async function load(documents: LegalDocumentMeta[] | undefined): Promise<void> {
    if (!documents) return;
    const loadGeneration = ++generation;
    const key = keyOf(documents);
    ready = false;
    error = false;
    const isLatest = () => loadGeneration === generation && key === keyOf(getCurrent());
    try {
      await Promise.all(
        documents.map((document) =>
          queryClient.fetchQuery(legalDocumentQueryOptions(document.doc_type, document.version)),
        ),
      );
      if (isLatest()) ready = true;
    } catch {
      if (isLatest()) error = true;
    }
  }

  $effect(() => {
    const key = payloadKey;
    if (key === null) return;
    untrack(() => {
      if (loadedKey !== null && loadedKey !== key) onPayloadChange?.();
      loadedKey = key;
      void load(getCurrent());
    });
  });

  return {
    get ready() {
      return ready;
    },
    get error() {
      return error;
    },
    reload: () => load(getCurrent()),
  };
}

function keyOf(documents: LegalDocumentMeta[] | undefined): string | null {
  if (!documents) return null;
  return documents
    .map((document) => `${document.doc_type}@${document.version}#${document.sha256}`)
    .join('|');
}
