<script lang="ts">
  import AssetCard from './AssetCard.svelte';
  import InfiniteScrollSentinel from '$lib/components/shared/InfiniteScrollSentinel.svelte';
  import type { components } from '$lib/api/types';

  type LibraryAssetItem = components['schemas']['LibraryAssetItem'];

  let {
    items,
    onCardClick,
    onCardDelete,
    onCardRename,
    onCardExtractFrame,
    onCardViewSettings,
    onLoadMore,
    loadMoreDisabled = true,
  }: {
    items: LibraryAssetItem[];
    onCardClick: (item: LibraryAssetItem) => void;
    onCardDelete: (item: LibraryAssetItem) => void;
    onCardRename?: (item: LibraryAssetItem) => void;
    onCardExtractFrame?: (item: LibraryAssetItem) => void;
    onCardViewSettings?: (item: LibraryAssetItem) => void;
    onLoadMore: () => void;
    loadMoreDisabled?: boolean;
  } = $props();
</script>

<div class="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
  {#each items as item (item.asset_ref)}
    <AssetCard
      {item}
      onclick={() => onCardClick(item)}
      onDelete={onCardDelete}
      onRename={onCardRename}
      onExtractFrame={onCardExtractFrame}
      onViewSettings={onCardViewSettings}
    />
  {/each}
</div>

<InfiniteScrollSentinel onVisible={onLoadMore} disabled={loadMoreDisabled} />
