<script lang="ts">
  import { locale, SUPPORTED_LOCALES, type Locale } from '$lib/stores/locale';
  import * as m from '$paraglide/messages';
  import { useQueryClient, createMutation } from '@tanstack/svelte-query';
  import apiClient from '$lib/api/client';
  import type { components } from '$lib/api/types';

  type UserResponse = components['schemas']['UserProfileResponse'];

  const queryClient = useQueryClient();

  const LOCALE_LABELS: Record<Locale, () => string> = {
    en: m.profile_language_en,
    ru: m.profile_language_ru,
    sr: m.profile_language_sr,
  };

  const updateLocale = createMutation(() => ({
    mutationFn: async (newLocale: Locale): Promise<UserResponse> => {
      const { data, error } = await apiClient.PATCH('/v1/users/me', {
        body: { locale: newLocale },
      });
      if (error) throw error;
      return data as UserResponse;
    },
    onSuccess: (data) => {
      if (data.locale) locale.hydrate(data.locale);
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  }));

  function handleChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    updateLocale.mutate(select.value as Locale);
  }
</script>

<div class="locale-selector">
  <label class="locale-label" for="locale-select">
    {m.profile_language_label()}
  </label>
  <select
    id="locale-select"
    value={$locale}
    onchange={handleChange}
    disabled={updateLocale.isPending}
    class="locale-select"
  >
    {#each SUPPORTED_LOCALES as lang (lang)}
      <option value={lang}>{LOCALE_LABELS[lang]()}</option>
    {/each}
  </select>
</div>

<style>
  .locale-selector {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .locale-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--apex-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .locale-select {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--apex-border);
    background: var(--apex-surface);
    color: var(--apex-text);
    font-size: 14px;
    cursor: pointer;
    width: 100%;
    max-width: 220px;
    font-family: inherit;
  }
  .locale-select:focus {
    outline: none;
    border-color: var(--apex-border-active);
  }
  .locale-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
