<script lang="ts">
  import { issueId, issueMessage } from '$lib/studio/formErrors';
  import type { DraftIssue } from '$lib/studio/songValidation';

  /** Messages shown beside one control, which points at them with `describedBy(controlId, issues)`.
   *  They follow every keystroke, so they are deliberately not live regions. */
  let { controlId, issues }: { controlId: string; issues: DraftIssue[] } = $props();
</script>

{#each issues as item, index (`${item.code}-${index}`)}
  <p id={issueId(controlId, index)} class="mt-1 text-xs text-danger">
    {issueMessage({ path: item.path ?? '', code: item.code })}
  </p>
{/each}
