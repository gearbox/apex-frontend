<script lang="ts">
  import { toasts } from '$lib/stores/toasts';
  import Toast from './Toast.svelte';
</script>

<div class="pointer-events-none fixed bottom-20 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6">
  {#each $toasts as toast (toast.id)}
    <div class="pointer-events-auto w-full max-w-sm">
      <Toast {toast} />
    </div>
  {/each}
</div>
