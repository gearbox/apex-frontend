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
    bulkError = false,
  }: {
    item: LibraryAssetItem;
    onclick: () => void;
    onDelete: (item: LibraryAssetItem) => void;
    onRename?: (item: LibraryAssetItem) => void;
    onExtractFrame?: (item: LibraryAssetItem) => void;
    onViewSettings?: (item: LibraryAssetItem) => void;
    /** Selection mode makes card taps toggle rather than open the details sheet. */
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: (item: LibraryAssetItem) => void;
    /** Returned by a failed bulk request; stays visible until the next bulk attempt/filter change. */
    bulkError?: boolean;
  } = $props();

  const isVideo = $derived(item.media.media_type === 'video');
  const isExpiringSoon = $derived.by(() => {
    const remaining = new Date(item.expires_at).getTime() - Date.now();
    return remaining > 0 && remaining < EXPIRES_SOON_MS;
  });

  const queryClient = useQueryClient();
  const favoriteMutation = createMutation(() => favoriteMutationOptions(queryClient));

  function toggleFavorite() {
    favoriteMutation.mutate({ assetRef: item.asset_ref, favorite: !item.is_favorite });
  }

  let contextMenu: ReturnType<typeof ContextMenu> | undefined = $state();
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressStart: { x: number; y: number } | null = null;
  let suppressCardClickUntil = 0;

  function clearLongPress() {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = null;
    longPressStart = null;
  }

  function handleTouchStart(event: TouchEvent) {
    if (!onToggleSelect || event.touches.length !== 1) return;
    const touch = event.touches[0];
    longPressStart = { x: touch.clientX, y: touch.clientY };
    longPressTimer = setTimeout(() => {
      suppressCardClickUntil = Date.now() + 500;
      onToggleSelect(item);
      clearLongPress();
    }, 450);
  }

  function handleTouchMove(event: TouchEvent) {
    if (!longPressStart || event.touches.length !== 1) return;
    const touch = event.touches[0];
    // Let a normal scroll or SwipeToDelete gesture win; long press never prevents touch events.
    if (Math.hypot(touch.clientX - longPressStart.x, touch.clientY - longPressStart.y) > 8) {
      clearLongPress();
    }
  }

  function handleCardClick() {
    if (Date.now() < suppressCardClickUntil) return;
    if (selectable && onToggleSelect) {
      onToggleSelect(item);
      return;
    }
    onclick();
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

<ContextMenu bind:this={contextMenu} items={menuItems}>
  <SwipeToDelete
    ondelete={() => onDelete(item)}
    disabled={!item.available_actions.includes('delete')}
  >
    <div
      role="presentation"
      class="group relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-surface transition-all hover:border-border-active hover:shadow-lg {bulkError
        ? 'ring-2 ring-danger ring-offset-1 ring-offset-bg'
        : ''}"
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={clearLongPress}
      ontouchcancel={clearLongPress}
    >
      <!-- Full-cover click target — sits behind the smaller action buttons below, which
           paint over it in DOM order, so a single element hierarchy has no nested buttons. -->
      <button
        onclick={handleCardClick}
        class="absolute inset-0 z-0"
        aria-label={item.display_title ?? item.original_filename ?? m.library_details_title()}
      ></button>

      {#if onToggleSelect}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(item);
          }}
          class="absolute left-2 top-2 z-10 hidden h-5 w-5 rounded-md border-2 transition-opacity md:flex md:items-center md:justify-center {selectable
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 focus:opacity-100'} {selected
            ? 'border-accent bg-accent'
            : 'border-white/70 bg-black/20'}"
          aria-label={m.library_select()}
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
        class:top-9={selectable || !!onToggleSelect}
      >
        {item.source === 'upload' ? m.library_badge_uploaded() : m.library_badge_generated()}
      </div>

      <!-- Favorite toggle -->
      {#if item.available_actions.includes('favorite')}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            toggleFavorite();
          }}
          class="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
          aria-label={item.is_favorite
            ? m.library_action_unfavorite()
            : m.library_action_favorite()}
          aria-pressed={item.is_favorite}
        >
          <Heart size={13} fill={item.is_favorite ? 'currentColor' : 'none'} />
        </button>
      {/if}

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
            contextMenu?.openAt(rect.left, rect.bottom);
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
      {#if bulkError}
        <span class="sr-only">{m.library_bulk_error()}</span>
      {/if}
    </div>
  </SwipeToDelete>
</ContextMenu>
