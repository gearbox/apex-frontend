<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import { MAX_PROMPT_LENGTH } from '$lib/utils/constants';
  import * as m from '$paraglide/messages';

  let charCount = $derived($generationStore.prompt.length);
  let nearLimit = $derived(charCount > MAX_PROMPT_LENGTH * 0.9);
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-baseline justify-between">
    <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{m.create_prompt_label()}</span>
    <span class="font-mono text-[11px] {nearLimit ? 'text-warning' : 'text-text-dim'}">{charCount}/{MAX_PROMPT_LENGTH}</span>
  </div>
  <textarea
    value={$generationStore.prompt}
    oninput={(e) => generationStore.setPrompt((e.target as HTMLTextAreaElement).value)}
    maxlength={MAX_PROMPT_LENGTH}
    rows={4}
    placeholder={m.create_prompt_placeholder()}
    class="w-full resize-none rounded-2.5 border border-border bg-surface p-3 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none transition-colors"
  ></textarea>
</div>
