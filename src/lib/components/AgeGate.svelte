<script lang="ts">
  import * as m from '$paraglide/messages';

  interface AgeGateResult {
    ageConfirmed?: boolean;
    dateOfBirth?: string;
  }

  interface Props {
    ageGateMode: 'checkbox' | 'date_of_birth';
    onConfirmed: (result: AgeGateResult) => void;
  }

  let { ageGateMode, onConfirmed }: Props = $props();

  let checked = $state(false);
  let dateOfBirth = $state('');
  let error = $state('');

  // Max date for DOB input: today (cannot be born in the future)
  const maxDate = new Date().toISOString().split('T')[0];

  function validateAge(dob: string): boolean {
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const mo = today.getMonth() - birth.getMonth();
    if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 18;
  }

  function handleContinue() {
    error = '';

    if (ageGateMode === 'checkbox') {
      if (!checked) {
        error = m.age_gate_error_checkbox();
        return;
      }
      onConfirmed({ ageConfirmed: true });
    } else {
      if (!dateOfBirth) {
        error = m.age_gate_error_dob_missing();
        return;
      }
      if (!validateAge(dateOfBirth)) {
        error = m.age_gate_error_underage();
        return;
      }
      onConfirmed({ dateOfBirth });
    }
  }
</script>

<div class="flex min-h-dvh items-center justify-center bg-bg px-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-accent">{m.age_gate_title()}</h1>
      <p class="mt-2 text-sm text-text-muted">
        {m.age_gate_subtitle()}
      </p>
    </div>

    {#if error}
      <div class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
        {error}
      </div>
    {/if}

    {#if ageGateMode === 'checkbox'}
      <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-4">
        <input type="checkbox" bind:checked class="mt-0.5 h-4 w-4 accent-accent" />
        <span class="text-sm text-text">{m.age_gate_checkbox_label()}</span>
      </label>
    {:else}
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text">{m.age_gate_dob_label()}</span>
        <input
          type="date"
          bind:value={dateOfBirth}
          max={maxDate}
          class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
      </label>
    {/if}

    <button
      onclick={handleContinue}
      class="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
    >
      {m.age_gate_continue()}
    </button>
  </div>
</div>
