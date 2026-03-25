<script lang="ts">
  import { onDestroy } from 'svelte';
  import { API_BASE_URL } from '$lib/utils/constants';
  import { getAccessToken } from '$lib/stores/auth';

  let {
    src,
    posterSrc = null as string | null,
    class: className = '',
    controls = true,
    autoplay = false,
    loop = false,
    muted = false,
    playsinline = false,
  }: {
    src: string;
    posterSrc?: string | null;
    class?: string;
    controls?: boolean;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    playsinline?: boolean;
  } = $props();

  let objectUrl = $state<string | null>(null);
  let posterObjectUrl = $state<string | null>(null);
  let prevSrc = '';

  async function loadWithAuth(url: string): Promise<string | null> {
    const token = getAccessToken();
    try {
      const res = await fetch(`${API_BASE_URL}${url}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  }

  $effect(() => {
    if (src !== prevSrc) {
      prevSrc = src;
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      if (posterObjectUrl) { URL.revokeObjectURL(posterObjectUrl); posterObjectUrl = null; }
      loadWithAuth(src).then((u) => { objectUrl = u; });
      if (posterSrc) loadWithAuth(posterSrc).then((u) => { posterObjectUrl = u; });
    }
  });

  onDestroy(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (posterObjectUrl) URL.revokeObjectURL(posterObjectUrl);
  });
</script>

{#if objectUrl}
  <video
    src={objectUrl}
    poster={posterObjectUrl ?? undefined}
    class={className}
    {controls}
    {autoplay}
    {loop}
    {muted}
    {playsinline}
  ></video>
{/if}
