<script lang="ts">
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { Heart, Layers, MoreVertical } from 'lucide-svelte';
  import Media from '$lib/media/Media.svelte';
  import ContextMenu from '$lib/components/shared/ContextMenu.svelte';
  import SwipeToDelete from '$lib/components/shared/SwipeToDelete.svelte';
  import { favoriteMutationOptions } from '$lib/queries/library';
  import { resolveLibraryAction, libraryActionLabel, LIBRARY_ACTION_ICONS } from './actions';
  import { EXPIRES_SOON_MS } from '$lib/utils/constants';
  import { timeAgo, formatCountdown } from '$lib/utils/format';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';

  type LibraryAssetItem = components['schemas']['LibraryAssetItem'];

  let {
    item,
    onclick,
    onDelete,
    onRename,
    onExtractFrame,
    onViewSettings,
    selectable = false,
    selected = false,
    onToggleSelect,
  }: {
    item: LibraryAssetItem;
    onclick: () => void;
    onDelete: (item: LibraryAssetItem) => void;
    onRename?: (item: LibraryAssetItem) => void;
    onExtractFrame?: (item: LibraryAssetItem) => void;
    onViewSettings?: (item: LibraryAssetItem) => void;
    /** Multi-select prop surface — wired in Phase 2. Renders nothing yet. */
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: (item: LibraryAssetItem) => void;
  } = $props();

  const isVideo = $derived(item.media.media_type === 'video');
  const isExpiringSoon = $derived(
    new Date(item.expires_at).getTime() - Date.now() < EXPIRES_SOON_MS,
  );

  const queryClient = useQueryClient();
  const favoriteMutation = createMutation(() => favoriteMutationOptions(queryClient));

  function toggleFavorite() {
    favoriteMutation.mutate({ assetRef: item.asset_ref, favorite: !item.is_favorite });
  }

  const menuItems = $derived(
    item.available_actions
      .map((action) => {
        const handler = resolveLibraryAction(action, item, {
          onDelete: () => onDelete(item),
          onFavorite: toggleFavorite,
          onRename: onRename ? () => onRename(item) : undefined,
          onExtractFrame: onExtractFrame ? () => onExtractFrame(item) : undefined,
          onViewSettings: onViewSettings ? () => onViewSettings(item) : undefined,
        });
        if (!handler) return null;
        return {
          label: libraryActionLabel(action, item.is_favorite),
          icon: LIBRARY_ACTION_ICONS[action],
          variant: action === 'delete' ? ('danger' as const) : ('default' as const),
          onclick: handler,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
  );
</script>

<ContextMenu items={menuItems}>
  <SwipeToDelete
    ondelete={() => onDelete(item)}
    disabled={!item.available_actions.includes('delete')}
  >
    <div
      class="group relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-surface transition-all hover:border-border-active hover:shadow-lg"
    >
      <!-- Full-cover click target — sits behind the smaller action buttons below, which
           paint over it in DOM order, so a single element hierarchy has no nested buttons. -->
      <button
        {onclick}
        class="absolute inset-0 z-0"
        aria-label={item.display_title ?? item.original_filename ?? m.library_details_title()}
      ></button>

      {#if selectable}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(item);
          }}
          class="absolute left-2 top-2 z-10 h-5 w-5 rounded-md border-2 {selected
            ? 'border-accent bg-accent'
            : 'border-white/70 bg-black/20'}"
          aria-label="Select"
          aria-pressed={selected}
        ></button>
      {/if}

      <Media
        media={item.media}
        alt={item.display_title ?? item.original_filename ?? ''}
        sizes="(max-width: 768px) 50vw, 25vw"
        class="pointer-events-none h-full w-full object-cover transition-transform group-hover:scale-105"
      />

      <!-- Provenance badge -->
      <div
        class="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
        class:top-9={selectable}
      >
        {item.source === 'upload' ? m.library_badge_uploaded() : m.library_badge_generated()}
      </div>

      <!-- Favorite toggle -->
      <button
        type="button"
        onclick={(e) => {
          e.stopPropagation();
          toggleFavorite();
        }}
        class="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
        aria-label={item.is_favorite ? m.library_action_unfavorite() : m.library_action_favorite()}
        aria-pressed={item.is_favorite}
      >
        <Heart size={13} fill={item.is_favorite ? 'currentColor' : 'none'} />
      </button>

      <!-- Video duration chip -->
      {#if isVideo && item.duration_ms}
        <div
          class="absolute bottom-7 right-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
        >
          {formatCountdown(item.duration_ms)}
        </div>
      {/if}

      <!-- Bottom-left indicators: stack count + expiring-soon, stacked vertically -->
      <div class="absolute bottom-7 left-2 flex flex-col items-start gap-1">
        {#if item.output_count && item.output_count > 1}
          <div
            class="flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
          >
            <Layers size={10} />
            ×{item.output_count}
          </div>
        {/if}
        {#if isExpiringSoon}
          <div
            class="rounded-md bg-warning/80 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
          >
            {m.library_expires_soon()}
          </div>
        {/if}
      </div>

      <!-- Overflow menu button (desktop only — right-click on the card opens the same menu) -->
      {#if menuItems.length > 0}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            (e.currentTarget as HTMLElement).closest('[role="presentation"]')?.dispatchEvent(
              new MouseEvent('contextmenu', {
                clientX: rect.left,
                clientY: rect.bottom,
                bubbles: true,
                cancelable: true,
              }),
            );
          }}
          class="absolute bottom-7 right-2 hidden h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70 md:flex {isVideo &&
          item.duration_ms
            ? 'right-11'
            : ''}"
          aria-label={m.library_more_actions()}
        >
          <MoreVertical size={13} />
        </button>
      {/if}

      <!-- Bottom metadata strip -->
      <div
        class="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-border/50 bg-bg/70 px-2 py-1 backdrop-blur-sm"
      >
        <span class="truncate text-[11px] text-text-dim">{timeAgo(item.created_at)}</span>
      </div>
    </div>
  </SwipeToDelete>
</ContextMenu>
