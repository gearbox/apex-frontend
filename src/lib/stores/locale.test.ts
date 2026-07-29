import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const PARAGLIDE_STORAGE_KEY = 'PARAGLIDE_LOCALE';
const LEGACY_STORAGE_KEY = 'apex-locale';

async function coldLoad(options: { persisted?: string; legacy?: string } = {}) {
  localStorage.clear();
  document.documentElement.lang = '';
  if (options.persisted !== undefined) {
    localStorage.setItem(PARAGLIDE_STORAGE_KEY, options.persisted);
  }
  if (options.legacy !== undefined) {
    localStorage.setItem(LEGACY_STORAGE_KEY, options.legacy);
  }

  vi.resetModules();
  const localeStore = await import('./locale');
  const messages = await import('$paraglide/messages');
  const runtime = await import('$paraglide/runtime');
  return { ...localeStore, messages, runtime };
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.documentElement.lang = '';
});

afterEach(() => {
  localStorage.clear();
});

describe('locale store', () => {
  it('uses Paraglide persistence to render Russian translated content on a cold load', async () => {
    const { locale, messages, runtime } = await coldLoad({ persisted: 'ru' });

    expect(get(locale)).toBe('ru');
    expect(runtime.getLocale()).toBe('ru');
    expect(messages.language_selector_label()).toBe('Язык');
    expect(document.documentElement.lang).toBe('ru');
  });

  it('uses Paraglide persistence to render Serbian translated content on a cold load', async () => {
    const { locale, messages, runtime } = await coldLoad({ persisted: 'sr' });

    expect(get(locale)).toBe('sr');
    expect(runtime.getLocale()).toBe('sr');
    expect(messages.language_selector_label()).toBe('Jezik');
    expect(document.documentElement.lang).toBe('sr');
  });

  it('falls back to English for unsupported persisted values', async () => {
    const { locale, messages, runtime } = await coldLoad({ persisted: 'unsupported' });

    expect(get(locale)).toBe('en');
    expect(runtime.getLocale()).toBe('en');
    expect(messages.language_selector_label()).toBe('Language');
    expect(document.documentElement.lang).toBe('en');
  });

  it('migrates a valid apex-locale value to Paraglide persistence once', async () => {
    const { locale, messages } = await coldLoad({ legacy: 'ru' });

    expect(get(locale)).toBe('ru');
    expect(messages.language_selector_label()).toBe('Язык');
    expect(localStorage.getItem(PARAGLIDE_STORAGE_KEY)).toBe('ru');
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it('updates translated content without a full reload when the user selects another locale', async () => {
    const { locale, messages, runtime } = await coldLoad();

    locale.set('ru');

    expect(get(locale)).toBe('ru');
    expect(runtime.getLocale()).toBe('ru');
    expect(messages.language_selector_label()).toBe('Язык');
    expect(localStorage.getItem(PARAGLIDE_STORAGE_KEY)).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
  });

  it('preserves a selected locale across a reload/re-import', async () => {
    const firstLoad = await coldLoad();
    firstLoad.locale.set('sr');

    vi.resetModules();
    const reloadedStore = await import('./locale');
    const reloadedMessages = await import('$paraglide/messages');

    expect(get(reloadedStore.locale)).toBe('sr');
    expect(reloadedMessages.language_selector_label()).toBe('Jezik');
  });

  it('does not reset the locale when client-side route modules load', async () => {
    const { locale, messages } = await coldLoad({ persisted: 'ru' });

    // SPA navigation changes history without re-running module initialization.
    history.pushState({}, '', '/app/library');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(get(locale)).toBe('ru');
    expect(messages.language_selector_label()).toBe('Язык');
  });

  it('lets account hydration override the anonymous browser preference', async () => {
    const { locale, messages } = await coldLoad({ persisted: 'ru' });

    locale.hydrate('sr');

    expect(get(locale)).toBe('sr');
    expect(messages.language_selector_label()).toBe('Jezik');
    expect(localStorage.getItem(PARAGLIDE_STORAGE_KEY)).toBe('sr');
  });

  it('validates account locales before applying them', async () => {
    const { locale, messages } = await coldLoad({ persisted: 'ru' });

    locale.hydrate('xx');

    expect(get(locale)).toBe('en');
    expect(messages.language_selector_label()).toBe('Language');
  });
});
