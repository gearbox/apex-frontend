<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import { tick } from 'svelte';
  import { insertPromptToken } from '$lib/utils/r2vTokens';
  import { addToast } from '$lib/stores/toasts';
  import { MAX_PROMPT_LENGTH } from '$lib/utils/constants';
  import * as m from '$paraglide/messages';

  let {
    maxLength = MAX_PROMPT_LENGTH,
    warning = null,
  }: { maxLength?: number; warning?: string | null } = $props();
  let textarea: HTMLTextAreaElement;
  let caretStart = 0;
  let caretEnd = 0;
  function rememberCaret() {
    if (textarea) {
      caretStart = textarea.selectionStart;
      caretEnd = textarea.selectionEnd;
    }
  }
  export async function insertAtCursor(text: string) {
    const result = insertPromptToken(
      $generationStore.prompt,
      text,
      caretStart,
      caretEnd,
      maxLength,
    );
    if (!result) {
      addToast({ type: 'warning', message: m.prompt_insert_limit() });
      return;
    }
    generationStore.setPrompt(result.prompt);
    caretStart = caretEnd = result.caret;
    await tick();
    textarea.focus();
    textarea.setSelectionRange(result.caret, result.caret);
  }

  let charCount = $derived($generationStore.prompt.length);
  let nearLimit = $derived(charCount > maxLength * 0.9);
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-baseline justify-between">
    <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
      >{m.create_prompt_label()}</span
    >
    <span class="font-mono text-[11px] {nearLimit ? 'text-warning' : 'text-text-dim'}"
      >{charCount}/{maxLength}</span
    >
  </div>
  <textarea
    bind:this={textarea}
    onblur={rememberCaret}
    onselect={rememberCaret}
    onkeyup={rememberCaret}
    onclick={rememberCaret}
    value={$generationStore.prompt}
    oninput={(e) => generationStore.setPrompt((e.target as HTMLTextAreaElement).value)}
    maxlength={maxLength}
    rows={4}
    placeholder={m.create_prompt_placeholder()}
    class="w-full resize-none rounded-2.5 border border-border bg-surface p-3 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none transition-colors"
  ></textarea>
  {#if warning}<p role="alert" class="text-xs text-warning">{warning}</p>{/if}
</div>
