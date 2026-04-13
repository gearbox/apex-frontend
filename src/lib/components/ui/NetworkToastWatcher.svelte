<script lang="ts">
  import { networkStatus } from '$lib/stores/network';
  import { addToast } from '$lib/stores/toasts';
  import * as m from '$paraglide/messages';

  let previousStatus: string | null = null;

  $effect(() => {
    const current = $networkStatus;

    // Skip the initial mount — only fire on actual transitions
    if (previousStatus === null) {
      previousStatus = current;
      return;
    }

    if (current !== previousStatus) {
      if (current === 'offline') {
        addToast({ type: 'warning', message: m.offline_toast_went_offline(), durationMs: 5000 });
      } else if (current === 'online' && previousStatus === 'offline') {
        addToast({ type: 'success', message: m.offline_toast_back_online(), durationMs: 3000 });
      }
      previousStatus = current;
    }
  });
</script>
