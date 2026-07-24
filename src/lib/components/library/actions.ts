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
} from 'lucide-svelte';
import type { ComponentType, SvelteComponent } from 'svelte';
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
type MediaObject = components['schemas']['MediaObject'];
type GenerationType = components['schemas']['GenerationType'];
type AspectRatio = components['schemas']['AspectRatio'];
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
  navigate?: (path: string) => void;
}

/** The generation mode each navigation action prefills toward. Also drives visibility. */
export const ACTION_MODE: Partial<Record<LibraryAction, GenerationMode>> = {
  remix: 'i2i',
  create_variation: 'i2i',
  use_as_reference: 'i2i',
  animate: 'i2v',
  extend: 'v2v',
  use_as_first_frame: 'flf2v', // deferred — no model exposes it yet; hidden by availableModes
  use_as_last_frame: 'flf2v', // deferred — no model exposes it yet; hidden by availableModes
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
function prefillAndGo(
  params: Partial<GenerationState>,
  deps: LibraryActionDeps,
  afterPrefill?: () => void,
): void {
  generationStore.prefill(params);
  afterPrefill?.();
  (deps.navigate ?? goto)(ROUTES.create);
}

/** Prefills the generation store with this asset as the source image and navigates to Create. */
function useAsSource(
  asset: LibraryActionAsset,
  mode: GenerationMode,
  keepPrompt: boolean,
  deps: LibraryActionDeps,
): void {
  const model = resolveModelForMode(deps.providers, mode, asset.model);
  if (!model) {
    addToast({ type: 'error', message: m.library_action_no_model() });
    return;
  }

  const { source, id } = parseAssetRef(asset.asset_ref);
  const previewUrl = mediaFallbackSrc(asset.media, 512);

  prefillAndGo(
    {
      ...(keepPrompt ? { prompt: asset.prompt ?? '' } : {}),
      negativePrompt: asset.negative_prompt ?? undefined,
      model,
      mode,
    },
    deps,
    () => {
      if (source === 'output') {
        generationStore.setSourceOutputId(id, previewUrl);
      } else {
        generationStore.setUploadedImageId(id, previewUrl);
      }
    },
  );
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
      negativePrompt: detail.negative_prompt ?? undefined,
      model,
      mode,
    };

    // Validated against the resolved model's real capabilities — never pass a raw backend
    // string straight through to the store.
    if (mode === 'i2i') {
      const editRatios = getEditAspectRatios(findModelInfo(deps.providers, model));
      if (detail.aspect_ratio && (editRatios as readonly string[]).includes(detail.aspect_ratio)) {
        prefillParams.editAspectRatio = detail.aspect_ratio as AspectRatio;
      }
    } else if (
      detail.aspect_ratio &&
      (KNOWN_ASPECT_RATIOS as readonly string[]).includes(detail.aspect_ratio)
    ) {
      prefillParams.aspectRatio = detail.aspect_ratio as AspectRatio;
    }

    prefillAndGo(prefillParams, deps, afterPrefill);
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
      return () => useAsSource(asset, ACTION_MODE[action] as GenerationMode, true, deps);
    case 'animate':
      return () => useAsSource(asset, ACTION_MODE[action] as GenerationMode, true, deps);
    case 'extend':
      return () => useAsSource(asset, ACTION_MODE[action] as GenerationMode, true, deps);
    case 'use_as_reference':
    case 'use_as_first_frame':
    case 'use_as_last_frame':
      return () => useAsSource(asset, ACTION_MODE[action] as GenerationMode, false, deps);
    case 'reproduce':
      return () => reproduce(asset, deps);
    default:
      return null;
  }
}

export const LIBRARY_ACTION_ICONS: Record<LibraryUiAction, ComponentType<SvelteComponent>> = {
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
