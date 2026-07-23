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
  Share2,
  Trash2,
} from 'lucide-svelte';
import type { ComponentType, SvelteComponent } from 'svelte';
import { generationStore, type GenerationMode } from '$lib/stores/generation';
import { mediaFallbackSrc } from '$lib/media';
import { ROUTES } from '$lib/utils/routes';
import { parseAssetRef } from '$lib/utils/assetRef';
import { saveMedia, resolveSaveCapabilities, type SaveCapability } from '$lib/media/save';
import { toastSaveError } from '$lib/media/save/toastSaveError';
import type { components } from '$lib/api/types';
import * as m from '$paraglide/messages';

export type LibraryAction = components['schemas']['LibraryAction'];
/** Frontend-only pseudo-action layered on top of the backend enum — never sent to the API. */
export type LibraryUiAction = LibraryAction | 'share';
type MediaObject = components['schemas']['MediaObject'];
type ModelType = components['schemas']['ModelType'];
type GenerationType = components['schemas']['GenerationType'];

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

const DEFAULT_MODEL: ModelType = 'grok-imagine-image';

async function saveAsset(asset: LibraryActionAsset, mode: SaveCapability) {
  const { id } = parseAssetRef(asset.asset_ref);
  try {
    await saveMedia(mode, asset.media, id);
  } catch (error) {
    toastSaveError(error);
  }
}

/** Prefills the generation store with this asset as the source image and navigates to Create. */
function useAsSource(asset: LibraryActionAsset, mode: GenerationMode, keepPrompt: boolean) {
  const { source, id } = parseAssetRef(asset.asset_ref);
  const previewUrl = mediaFallbackSrc(asset.media, 512);

  generationStore.prefill({
    ...(keepPrompt ? { prompt: asset.prompt ?? '' } : {}),
    negativePrompt: asset.negative_prompt ?? undefined,
    model: (asset.model ?? DEFAULT_MODEL) as ModelType,
    mode,
  });

  // Must happen AFTER prefill — prefill resets image source fields unless included above.
  if (source === 'output') {
    generationStore.setSourceOutputId(id, previewUrl);
  } else {
    generationStore.setUploadedImageId(id, previewUrl);
  }

  goto(ROUTES.create);
}

/** Re-runs the same generation settings from scratch, without a source image. */
function reproduce(asset: LibraryActionAsset) {
  const mode: GenerationMode =
    asset.generation_type === 't2v'
      ? 't2v'
      : asset.generation_type === 'i2v' || asset.generation_type === 'v2v'
        ? 'i2v'
        : 't2i';

  generationStore.prefill({
    prompt: asset.prompt ?? '',
    negativePrompt: asset.negative_prompt ?? undefined,
    model: (asset.model ?? DEFAULT_MODEL) as ModelType,
    mode,
  });
  goto(ROUTES.create);
}

/**
 * Resolves an action handler for a single asset, or `null` for actions with
 * no wiring yet — callers must hide/skip those rather than throw.
 */
export function resolveLibraryAction(
  action: LibraryUiAction,
  asset: LibraryActionAsset,
  callbacks: LibraryActionCallbacks,
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
      return () => useAsSource(asset, 'i2i', true);
    case 'animate':
      return () => useAsSource(asset, 'i2v', true);
    case 'extend':
      return () => useAsSource(asset, 'v2v', true);
    case 'use_as_reference':
    case 'use_as_first_frame':
    case 'use_as_last_frame':
      return () => useAsSource(asset, 'i2i', false);
    case 'reproduce':
      return () => reproduce(asset);
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
  share: Share2,
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
  opts: { hasFlf2vModel: boolean },
): LibraryUiAction[] {
  const filtered = actions.filter((action) => {
    // Duplicate of `remix` with the current API surface — deferred until a real
    // create-variation prefill (denoise/seed) is implemented.
    if (action === 'create_variation') return false;
    if (action === 'use_as_first_frame' || action === 'use_as_last_frame') {
      return opts.hasFlf2vModel;
    }
    return true;
  });

  return filtered.flatMap((action): LibraryUiAction[] =>
    action === 'download' ? resolveSaveCapabilities() : [action],
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
