import { goto } from '$app/navigation';
import {
  Repeat2,
  Shuffle,
  Video,
  FastForward,
  Scissors,
  ImagePlus,
  Settings2,
  RotateCcw,
  Heart,
  Pencil,
  Download,
  Share,
  Trash2,
} from '@lucide/svelte';
import type { LucideIcon } from '@lucide/svelte';
import { generationStore, type GenerationState } from '$lib/stores/generation';
import { ROUTES } from '$lib/utils/routes';
import { parseAssetRef } from '$lib/utils/assetRef';
import { saveMedia, resolveSaveCapabilities, type SaveCapability } from '$lib/media/save';
import { toastSaveError } from '$lib/media/save/toastSaveError';
import { addToast } from '$lib/stores/toasts';
import { type GenerationMode } from '$lib/utils/generationModes';
import type { components } from '$lib/api/types';
import * as m from '$paraglide/messages';
import type { MediaSlot } from '$lib/utils/mediaSlots';
import {
  prefillRoleSourceForGeneration,
  prefillSourceForGeneration,
  replayGenerationPrefill,
  sourceMediaDraft,
  type ReplayFailureReason,
} from '$lib/services/generationPrefill';

export type LibraryAction = components['schemas']['LibraryAction'];
/** Frontend-only pseudo-action layered on top of the backend enum — never sent to the API. */
export type LibraryUiAction = LibraryAction | 'share';
export type LibraryActionGroup = 'save' | 'navigate';
type MediaObject = components['schemas']['MediaObject'];
type GenerationType = components['schemas']['GenerationType'];
type LibraryAssetDetail = components['schemas']['LibraryAssetDetail'];
type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];
type ProvidersResponse = components['schemas']['ProvidersResponse'];

/** Common shape shared by LibraryAssetItem and LibraryAssetDetail — enough for action dispatch. */
export interface LibraryActionAsset {
  asset_ref: string;
  media: MediaObject;
  model?: string | null;
  generation_type?: GenerationType | null;
  prompt?: string | null;
  negative_prompt?: string | null;
}

/** Callbacks for actions that need caller-owned UI (confirm dialogs, modals, sheets). */
export interface LibraryActionCallbacks {
  onDelete?: () => void;
  onFavorite?: () => void;
  onRename?: () => void;
  onExtractFrame?: () => void;
  onViewSettings?: () => void;
}

/** Collaborators injected so this module stays free of TanStack/`$app/navigation` coupling. */
export interface LibraryActionDeps {
  providers: ProvidersResponse | null | undefined;
  /** `queryClient.ensureQueryData(libraryAssetQueryOptions(ref))` at the call site. */
  loadDetail: (assetRef: string) => Promise<LibraryAssetDetail>;
  /** Re-Generate sources are authoritative only on the owning generation group. */
  loadGroup?: (jobId: string) => Promise<LibraryGroupDetail>;
  /** Defaults to `goto` — injected only for tests. */
  navigate?: (path: string) => void | Promise<void>;
}

type ModeSourceAction = 'remix' | 'create_variation' | 'animate' | 'extend' | 'use_as_reference';
type RoleSourceAction = 'use_as_first_frame' | 'use_as_last_frame';

/** The prompt policy is deliberately explicit: source-only actions preserve the user's draft,
 * while provenance actions replace it with the original generation text from asset detail. */
const MODE_ACTION_POLICY: Record<
  ModeSourceAction,
  { mode: GenerationMode; prompt: 'copy-provenance' | 'preserve-draft' }
> = {
  remix: { mode: 'i2i', prompt: 'copy-provenance' },
  create_variation: { mode: 'i2i', prompt: 'copy-provenance' },
  animate: { mode: 'i2v', prompt: 'copy-provenance' },
  extend: { mode: 'v2v', prompt: 'copy-provenance' },
  use_as_reference: { mode: 'i2i', prompt: 'preserve-draft' },
};

/**
 * `use_as_first_frame` / `use_as_last_frame` have no single fixed target mode
 * — they mean "select an enabled model capable of this named role, and tag
 * the source with it." The actual effective generation mode (i2v vs flf2v,
 * complete vs incomplete) is then resolved by Create itself from the
 * resulting draft, exactly like any other source-driven selection. Always
 * `preserve-draft`: these are source-only actions, never provenance replays.
 */
const ROLE_ACTION_POLICY: Record<RoleSourceAction, { role: MediaSlot }> = {
  use_as_first_frame: { role: 'first_frame' },
  use_as_last_frame: { role: 'last_frame' },
};

/** The generation mode each mode-based navigation action prefills toward. Also drives visibility. */
export const ACTION_MODE: Partial<Record<LibraryAction, GenerationMode>> = {
  remix: MODE_ACTION_POLICY.remix.mode,
  create_variation: MODE_ACTION_POLICY.create_variation.mode,
  use_as_reference: MODE_ACTION_POLICY.use_as_reference.mode,
  animate: MODE_ACTION_POLICY.animate.mode,
  extend: MODE_ACTION_POLICY.extend.mode,
};

/**
 * The named role each role-based action targets. Visibility for these
 * actions must come from actual enabled role capability
 * (`enabledRoles`/`availableRoles`), never from `availableModes.has('flf2v')`
 * — there is no fixed mode name to check. `use_as_reference` is additionally
 * eligible via a named `reference` role, on top of its roleless `i2i` path
 * above, since a future model could advertise `reference` explicitly.
 */
export const ACTION_ROLE: Partial<Record<LibraryAction, MediaSlot>> = {
  use_as_first_frame: ROLE_ACTION_POLICY.use_as_first_frame.role,
  use_as_last_frame: ROLE_ACTION_POLICY.use_as_last_frame.role,
  use_as_reference: 'reference',
};

async function saveAsset(asset: LibraryActionAsset, mode: SaveCapability) {
  const { id } = parseAssetRef(asset.asset_ref);
  try {
    await saveMedia(mode, asset.media, id);
  } catch (error) {
    toastSaveError(error);
  }
}

/** Shared prefill+navigate tail. */
async function prefillAndGo(
  params: Partial<GenerationState>,
  deps: LibraryActionDeps,
  afterPrefill?: () => void,
): Promise<void> {
  generationStore.prefill(params);
  afterPrefill?.();
  await Promise.resolve((deps.navigate ?? goto)(ROUTES.create));
}

function replayFailureMessage(reason: ReplayFailureReason): string {
  switch (reason) {
    case 'no-model':
      return m.library_action_no_model();
    case 'incompatible-source-policy':
      return m.library_reproduce_source_incompatible();
    default:
      return m.library_reproduce_source_missing();
  }
}

function sourceLabelFor(assetRef: string): string {
  return assetRef.startsWith('output:') ? 'From generated' : 'From uploads';
}

/** Prefills the generation store with this asset as the source image and navigates to Create.
 * Provenance actions fetch detail first because list summaries intentionally omit prompt fields. */
async function useAsModeSource(
  action: ModeSourceAction,
  asset: LibraryActionAsset,
  deps: LibraryActionDeps,
): Promise<void> {
  const policy = MODE_ACTION_POLICY[action];

  try {
    // A summary's missing field is not equivalent to a detail's explicit null. Only provenance
    // actions need generation metadata; source-only actions intentionally preserve draft text.
    const sourceAsset =
      policy.prompt === 'copy-provenance' ? await deps.loadDetail(asset.asset_ref) : asset;
    const didPrefill = prefillSourceForGeneration({
      providers: deps.providers,
      mode: policy.mode,
      preferredModel: sourceAsset.model,
      source: sourceMediaDraft(
        sourceAsset.asset_ref,
        sourceAsset.media,
        sourceLabelFor(sourceAsset.asset_ref),
      ),
      ...(policy.prompt === 'copy-provenance'
        ? {
            prompt: sourceAsset.prompt ?? '',
            // An explicit detail null means this generation had no negative prompt, so clear
            // rather than retain a stale/default non-nullable draft value.
            negativePrompt: sourceAsset.negative_prompt ?? '',
          }
        : {}),
    });
    if (!didPrefill) {
      addToast({ type: 'error', message: m.library_action_no_model() });
      return;
    }
    await Promise.resolve((deps.navigate ?? goto)(ROUTES.create));
  } catch {
    // This includes detail resolution and navigation. All handlers are safe to invoke
    // fire-and-forget by ContextMenu, so failures must be surfaced rather than rejected.
    addToast({ type: 'error', message: m.error_generic() });
  }
}

/**
 * Role-based counterpart of `useAsModeSource` for `use_as_first_frame` /
 * `use_as_last_frame`. Always source-only (`preserve-draft`): the asset list
 * summary already carries everything needed, so no detail fetch happens.
 */
async function useAsRoleSource(
  action: RoleSourceAction,
  asset: LibraryActionAsset,
  deps: LibraryActionDeps,
): Promise<void> {
  const { role } = ROLE_ACTION_POLICY[action];
  try {
    const didPrefill = prefillRoleSourceForGeneration({
      providers: deps.providers,
      role,
      preferredModel: asset.model,
      source: sourceMediaDraft(asset.asset_ref, asset.media, sourceLabelFor(asset.asset_ref)),
    });
    if (!didPrefill) {
      addToast({ type: 'error', message: m.library_action_no_model() });
      return;
    }
    await Promise.resolve((deps.navigate ?? goto)(ROUTES.create));
  } catch {
    addToast({ type: 'error', message: m.error_generic() });
  }
}

/**
 * Re-runs the same generation settings from scratch, using the owning group's
 * `source_media` as replay authority. An available source replays its exact
 * ordered `asset_ref`; an unavailable (deleted/expired) historical source
 * preserves its position as a placeholder instead of being dropped — Generate
 * stays blocked on the Create page until that position is replaced. Only a
 * genuinely unresolvable step (no model/mode can accept this source shape,
 * duplicate refs, or the owning job/group failed to load) shows an error
 * toast and never navigates. Never rejects — every failure path is caught and
 * surfaced as a toast.
 */
async function reproduce(asset: LibraryActionAsset, deps: LibraryActionDeps): Promise<void> {
  try {
    const detail = await deps.loadDetail(asset.asset_ref);
    if (!detail.job_id || !deps.loadGroup) {
      addToast({ type: 'error', message: m.library_reproduce_source_missing() });
      return;
    }
    const result = replayGenerationPrefill(
      detail,
      deps.providers,
      await deps.loadGroup(detail.job_id),
    );
    if (!result.ok) {
      addToast({ type: 'error', message: replayFailureMessage(result.reason) });
      return;
    }
    await prefillAndGo(result.params, deps);
  } catch {
    addToast({ type: 'error', message: m.error_generic() });
  }
}

/**
 * Resolves an action handler for a single asset, or `null` for actions with
 * no wiring yet — callers must hide/skip those rather than throw.
 */
export function resolveLibraryAction(
  action: LibraryUiAction,
  asset: LibraryActionAsset,
  callbacks: LibraryActionCallbacks,
  deps: LibraryActionDeps,
): (() => void | Promise<void>) | null {
  switch (action) {
    case 'share':
      return () => saveAsset(asset, 'share');
    case 'download':
      return () => saveAsset(asset, 'download');
    case 'delete':
      return callbacks.onDelete ?? null;
    case 'favorite':
      return callbacks.onFavorite ?? null;
    case 'rename':
      return callbacks.onRename ?? null;
    case 'extract_frame':
      return callbacks.onExtractFrame ?? null;
    case 'view_settings':
      return callbacks.onViewSettings ?? null;
    case 'remix':
    case 'create_variation':
    case 'animate':
    case 'extend':
    case 'use_as_reference':
      return () => useAsModeSource(action, asset, deps);
    case 'use_as_first_frame':
    case 'use_as_last_frame':
      return () => useAsRoleSource(action, asset, deps);
    case 'reproduce':
      return () => reproduce(asset, deps);
    default:
      return null;
  }
}

const SOURCE_ACTIONS = new Set<LibraryUiAction>([
  ...(Object.keys(MODE_ACTION_POLICY) as ModeSourceAction[]),
  ...(Object.keys(ROLE_ACTION_POLICY) as RoleSourceAction[]),
]);

/** The controller policy for Library actions. Navigation is globally serialized per owner;
 * saves are scoped by the caller-provided action key so different assets remain independent. */
export function libraryActionGroup(action: LibraryUiAction): LibraryActionGroup | null {
  if (action === 'share' || action === 'download') return 'save';
  if (action === 'reproduce' || SOURCE_ACTIONS.has(action)) return 'navigate';
  return null;
}

export const LIBRARY_ACTION_ICONS: Record<LibraryUiAction, LucideIcon> = {
  remix: Repeat2,
  create_variation: Shuffle,
  animate: Video,
  extend: FastForward,
  extract_frame: Scissors,
  use_as_reference: ImagePlus,
  use_as_first_frame: ImagePlus,
  use_as_last_frame: ImagePlus,
  view_settings: Settings2,
  reproduce: RotateCcw,
  favorite: Heart,
  rename: Pencil,
  share: Share,
  download: Download,
  delete: Trash2,
};

/**
 * Centralizes which actions are actually reachable given the current API surface. Applied
 * at both render sites (AssetCard menu, AssetDetailsSheet menu) so they never diverge.
 * A present `download` expands into the platform-resolved save capabilities (share before
 * download), in place, since `share` has no backend representation of its own.
 *
 * `availableRoles` is the Phase 4 role-capability predicate
 * (`enabledRoles(providers)`): `use_as_first_frame` / `use_as_last_frame`
 * have no fixed mode name, so `availableModes` alone can never gate them.
 * `use_as_reference` accepts either its roleless `i2i`-shaped path or a
 * named `reference` role.
 */
export function filterVisibleLibraryActions(
  actions: LibraryAction[],
  opts: {
    availableModes: ReadonlySet<GenerationMode>;
    availableRoles?: ReadonlySet<MediaSlot>;
    generationType?: GenerationType | null;
    saveCapabilities?: SaveCapability[];
  },
): LibraryUiAction[] {
  const availableRoles = opts.availableRoles ?? new Set<MediaSlot>();
  const filtered = actions.filter((action) => {
    // Duplicate of `remix` with the current API surface — deferred until a real
    // create-variation prefill (denoise/seed) is implemented.
    if (action === 'create_variation') return false;
    const mode = ACTION_MODE[action];
    const role = ACTION_ROLE[action];
    if (mode === undefined && role === undefined) return true;
    return (
      (mode !== undefined && opts.availableModes.has(mode)) ||
      (role !== undefined && availableRoles.has(role))
    );
  });

  const capabilities = opts.saveCapabilities ?? resolveSaveCapabilities();

  return filtered.flatMap((action): LibraryUiAction[] =>
    action === 'download' ? capabilities : [action],
  );
}

export function libraryActionLabel(action: LibraryUiAction, isFavorite = false): string {
  switch (action) {
    case 'share':
      return m.common_share();
    case 'remix':
      return m.library_action_remix();
    case 'create_variation':
      return m.library_action_create_variation();
    case 'animate':
      return m.library_action_animate();
    case 'extend':
      return m.library_action_extend();
    case 'extract_frame':
      return m.frames_extract_action();
    case 'use_as_reference':
      return m.library_action_use_as_reference();
    case 'use_as_first_frame':
      return m.library_action_use_as_first_frame();
    case 'use_as_last_frame':
      return m.library_action_use_as_last_frame();
    case 'view_settings':
      return m.library_action_view_settings();
    case 'reproduce':
      return m.library_action_reproduce();
    case 'favorite':
      return isFavorite ? m.library_action_unfavorite() : m.library_action_favorite();
    case 'rename':
      return m.library_action_rename();
    case 'download':
      return m.common_download();
    case 'delete':
      return m.common_delete();
    default:
      return action;
  }
}
