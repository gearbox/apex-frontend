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
import { mediaFallbackSrc } from '$lib/media';
import { ROUTES } from '$lib/utils/routes';
import { parseAssetRef } from '$lib/utils/assetRef';
import { saveMedia, resolveSaveCapabilities, type SaveCapability } from '$lib/media/save';
import { toastSaveError } from '$lib/media/save/toastSaveError';
import { addToast } from '$lib/stores/toasts';
import {
  type GenerationMode,
  isGenerationMode,
  modeRequiresSource,
  resolveModelForMode,
  findModelInfo,
} from '$lib/utils/generationModes';
import { getEditAspectRatios, KNOWN_ASPECT_RATIOS } from '$lib/utils/modelCapabilities';
import type { components } from '$lib/api/types';
import * as m from '$paraglide/messages';

export type LibraryAction = components['schemas']['LibraryAction'];
/** Frontend-only pseudo-action layered on top of the backend enum — never sent to the API. */
export type LibraryUiAction = LibraryAction | 'share';
export type LibraryActionGroup = 'save' | 'navigate';
type MediaObject = components['schemas']['MediaObject'];
type GenerationType = components['schemas']['GenerationType'];
type AspectRatio = components['schemas']['AspectRatio'];
type ModelType = components['schemas']['ModelType'];
type LibraryAssetDetail = components['schemas']['LibraryAssetDetail'];
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
  /** Defaults to `goto` — injected only for tests. */
  navigate?: (path: string) => void | Promise<void>;
}

type SourceAction =
  | 'remix'
  | 'create_variation'
  | 'animate'
  | 'extend'
  | 'use_as_reference'
  | 'use_as_first_frame'
  | 'use_as_last_frame';

/** The prompt policy is deliberately explicit: source-only actions preserve the user's draft,
 * while provenance actions replace it with the original generation text from asset detail. */
const SOURCE_ACTION_POLICY: Record<
  SourceAction,
  { mode: GenerationMode; prompt: 'copy-provenance' | 'preserve-draft' }
> = {
  remix: { mode: 'i2i', prompt: 'copy-provenance' },
  create_variation: { mode: 'i2i', prompt: 'copy-provenance' },
  animate: { mode: 'i2v', prompt: 'copy-provenance' },
  extend: { mode: 'v2v', prompt: 'copy-provenance' },
  use_as_reference: { mode: 'i2i', prompt: 'preserve-draft' },
  use_as_first_frame: { mode: 'flf2v', prompt: 'preserve-draft' },
  use_as_last_frame: { mode: 'flf2v', prompt: 'preserve-draft' },
};

/** The generation mode each navigation action prefills toward. Also drives visibility. */
export const ACTION_MODE: Partial<Record<LibraryAction, GenerationMode>> = {
  remix: SOURCE_ACTION_POLICY.remix.mode,
  create_variation: SOURCE_ACTION_POLICY.create_variation.mode,
  use_as_reference: SOURCE_ACTION_POLICY.use_as_reference.mode,
  animate: SOURCE_ACTION_POLICY.animate.mode,
  extend: SOURCE_ACTION_POLICY.extend.mode,
  // Deferred — no model exposes flf2v yet, so filterVisibleLibraryActions hides them.
  use_as_first_frame: SOURCE_ACTION_POLICY.use_as_first_frame.mode,
  use_as_last_frame: SOURCE_ACTION_POLICY.use_as_last_frame.mode,
};

async function saveAsset(asset: LibraryActionAsset, mode: SaveCapability) {
  const { id } = parseAssetRef(asset.asset_ref);
  try {
    await saveMedia(mode, asset.media, id);
  } catch (error) {
    toastSaveError(error);
  }
}

/** Shared prefill+navigate tail. `afterPrefill` runs between the two — the only place an image
 *  source may be set, since `prefill` itself resets image-source fields unless present in params. */
async function prefillAndGo(
  params: Partial<GenerationState>,
  deps: LibraryActionDeps,
  afterPrefill?: () => void,
): Promise<void> {
  generationStore.prefill(params);
  afterPrefill?.();
  await Promise.resolve((deps.navigate ?? goto)(ROUTES.create));
}

/** i2i reshapes via editAspectRatio and must be validated against the resolved model's real
 * edit capabilities; every other mode uses the t2i/video aspectRatio field. */
export function aspectRatioPrefill(
  aspectRatio: string | null | undefined,
  mode: GenerationMode,
  model: ModelType,
  providers: ProvidersResponse | null | undefined,
): Pick<GenerationState, 'aspectRatio'> | Pick<GenerationState, 'editAspectRatio'> | undefined {
  if (!aspectRatio) return undefined;

  if (mode === 'i2i') {
    const editRatios = getEditAspectRatios(findModelInfo(providers, model));
    return (editRatios as readonly string[]).includes(aspectRatio)
      ? { editAspectRatio: aspectRatio as AspectRatio }
      : undefined;
  }

  return (KNOWN_ASPECT_RATIOS as readonly string[]).includes(aspectRatio)
    ? { aspectRatio: aspectRatio as AspectRatio }
    : undefined;
}

/** Prefills the generation store with this asset as the source image and navigates to Create.
 * Provenance actions fetch detail first because list summaries intentionally omit prompt fields. */
async function useAsSource(
  action: SourceAction,
  asset: LibraryActionAsset,
  deps: LibraryActionDeps,
): Promise<void> {
  const policy = SOURCE_ACTION_POLICY[action];

  try {
    // A summary's missing field is not equivalent to a detail's explicit null. Only provenance
    // actions need generation metadata; source-only actions intentionally preserve draft text.
    const sourceAsset =
      policy.prompt === 'copy-provenance' ? await deps.loadDetail(asset.asset_ref) : asset;
    const model = resolveModelForMode(deps.providers, policy.mode, sourceAsset.model);
    if (!model) {
      addToast({ type: 'error', message: m.library_action_no_model() });
      return;
    }

    const { source, id } = parseAssetRef(sourceAsset.asset_ref);
    const previewUrl = mediaFallbackSrc(sourceAsset.media, 512);
    const prefillParams: Partial<GenerationState> = {
      model,
      mode: policy.mode,
      ...(policy.prompt === 'copy-provenance'
        ? {
            prompt: sourceAsset.prompt ?? '',
            // An explicit detail null means this generation had no negative prompt, so clear
            // rather than retain a stale/default non-nullable draft value.
            negativePrompt: sourceAsset.negative_prompt ?? '',
          }
        : {}),
    };

    await prefillAndGo(prefillParams, deps, () => {
      if (source === 'output') {
        generationStore.setSourceOutputId(id, previewUrl);
      } else {
        generationStore.setUploadedImageId(id, previewUrl);
      }
    });
  } catch {
    // This includes detail resolution and navigation. All handlers are safe to invoke
    // fire-and-forget by ContextMenu, so failures must be surfaced rather than rejected.
    addToast({ type: 'error', message: m.error_generic() });
  }
}

/**
 * Re-runs the same generation settings from scratch. All-or-nothing: any unresolvable step
 * (no capable model, missing/deleted source asset) shows an error toast and never navigates.
 * Never rejects — every failure path is caught and surfaced as a toast.
 */
async function reproduce(asset: LibraryActionAsset, deps: LibraryActionDeps): Promise<void> {
  try {
    const detail = await deps.loadDetail(asset.asset_ref);
    const mode: GenerationMode = isGenerationMode(detail.generation_type)
      ? detail.generation_type
      : 't2i';

    const model = resolveModelForMode(deps.providers, mode, detail.model);
    if (!model) {
      addToast({ type: 'error', message: m.library_action_no_model() });
      return;
    }

    let afterPrefill: (() => void) | undefined;

    if (modeRequiresSource(mode)) {
      const sourceRef = detail.lineage?.source_asset_ref;
      if (!sourceRef) {
        addToast({ type: 'error', message: m.library_reproduce_source_missing() });
        return;
      }

      let sourceDetail: LibraryAssetDetail;
      try {
        sourceDetail = await deps.loadDetail(sourceRef);
      } catch {
        addToast({ type: 'error', message: m.library_reproduce_source_missing() });
        return;
      }

      const previewUrl = mediaFallbackSrc(sourceDetail.media, 512);
      const { source, id } = parseAssetRef(sourceRef);
      afterPrefill = () => {
        if (source === 'output') {
          generationStore.setSourceOutputId(id, previewUrl);
        } else {
          generationStore.setUploadedImageId(id, previewUrl);
        }
      };
    }

    const prefillParams: Partial<GenerationState> = {
      prompt: detail.prompt ?? '',
      // Explicit detail null means the original generation had no negative prompt.
      negativePrompt: detail.negative_prompt ?? '',
      model,
      mode,
      ...aspectRatioPrefill(detail.aspect_ratio, mode, model, deps.providers),
    };

    await prefillAndGo(prefillParams, deps, afterPrefill);
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
    case 'use_as_first_frame':
    case 'use_as_last_frame':
      return () => useAsSource(action, asset, deps);
    case 'reproduce':
      return () => reproduce(asset, deps);
    default:
      return null;
  }
}

/** The controller policy for Library actions. Navigation is globally serialized per owner;
 * saves are scoped by the caller-provided action key so different assets remain independent. */
export function libraryActionGroup(action: LibraryUiAction): LibraryActionGroup | null {
  if (action === 'share' || action === 'download') return 'save';
  if (action === 'reproduce' || action in SOURCE_ACTION_POLICY) return 'navigate';
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
 */
export function filterVisibleLibraryActions(
  actions: LibraryAction[],
  opts: { availableModes: ReadonlySet<GenerationMode>; saveCapabilities?: SaveCapability[] },
): LibraryUiAction[] {
  const filtered = actions.filter((action) => {
    // Duplicate of `remix` with the current API surface — deferred until a real
    // create-variation prefill (denoise/seed) is implemented.
    if (action === 'create_variation') return false;
    const mode = ACTION_MODE[action];
    if (mode && !opts.availableModes.has(mode)) return false;
    return true;
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
