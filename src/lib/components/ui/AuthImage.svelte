<script lang="ts">
  import { onDestroy } from 'svelte';
  import { API_BASE_URL } from '$lib/utils/constants';
  import { getAccessToken } from '$lib/stores/auth';

  let {
    src,
    alt = '',
    class: className = '',
    loading = 'lazy' as 'lazy' | 'eager',
  }: {
    src: string;
    alt?: string;
    class?: string;
    loading?: 'lazy' | 'eager';
  } = $props();

  let objectUrl = $state<string | null>(null);
  let prevSrc = '';

  async function load(url: string) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    const token = getAccessToken();
    try {
      const res = await fetch(`${API_BASE_URL}${url}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      objectUrl = URL.createObjectURL(await res.blob());
    } catch {
      // silently ignore — placeholder stays
    }
  }

  $effect(() => {
    if (src !== prevSrc) {
      prevSrc = src;
      load(src);
    }
  });

  onDestroy(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
</script>

{#if objectUrl}
  <img src={objectUrl} {alt} class={className} {loading} />
{/if}
