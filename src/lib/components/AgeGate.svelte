<script lang="ts">
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
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 18;
  }

  function handleContinue() {
    error = '';

    if (ageGateMode === 'checkbox') {
      if (!checked) {
        error = 'You must confirm you are 18 years or older to continue.';
        return;
      }
      onConfirmed({ ageConfirmed: true });
    } else {
      if (!dateOfBirth) {
        error = 'Please enter your date of birth.';
        return;
      }
      if (!validateAge(dateOfBirth)) {
        error = 'You must be 18 or older to use this service.';
        return;
      }
      onConfirmed({ dateOfBirth });
    }
  }
</script>

<div class="flex min-h-dvh items-center justify-center bg-bg px-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-accent">Age Verification</h1>
      <p class="mt-2 text-sm text-text-muted">
        This platform contains adult content. You must be 18 or older to continue.
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
        <span class="text-sm text-text">I confirm that I am 18 years of age or older.</span>
      </label>
    {:else}
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text">Date of Birth</span>
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
      Continue
    </button>
  </div>
</div>
