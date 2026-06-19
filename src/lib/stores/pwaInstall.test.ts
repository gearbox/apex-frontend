import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

const DISMISSED_KEY = 'apex-pwa-install-dismissed';

/** Create a mock BeforeInstallPromptEvent */
function makeMockPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  return Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  });
}

function mockMatchMedia(standalone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: standalone && query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('pwaInstall store', () => {
  beforeEach(() => {
    localStorage.clear();
    mockMatchMedia(false);
    vi.resetModules();

    // Mock platform detection to return 'chromium' by default for Chromium tests
    vi.doMock('$lib/utils/platform', () => ({
      getInstallPlatform: () => 'chromium' as const,
      isStandalone: () => false,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('canInstall is false by default', async () => {
    const { canInstall } = await import('./pwaInstall');
    expect(get(canInstall)).toBe(false);
  });

  it('canInstall becomes true after beforeinstallprompt event', async () => {
    const { canInstall, initPwaInstallListener } = await import('./pwaInstall');

    const cleanup = initPwaInstallListener();
    expect(get(canInstall)).toBe(false);

    const mockEvent = makeMockPromptEvent();
    window.dispatchEvent(mockEvent);

    expect(get(canInstall)).toBe(true);
    cleanup();
  });

  it('triggerInstall calls prompt() and returns true on accepted', async () => {
    const { canInstall, triggerInstall, initPwaInstallListener } = await import('./pwaInstall');

    const cleanup = initPwaInstallListener();
    const mockEvent = makeMockPromptEvent('accepted');
    window.dispatchEvent(mockEvent);
    expect(get(canInstall)).toBe(true);

    const result = await triggerInstall();
    expect(mockEvent.prompt).toHaveBeenCalled();
    expect(result).toBe(true);
    expect(get(canInstall)).toBe(false);
    cleanup();
  });

  it('triggerInstall returns false on dismissed', async () => {
    const { canInstall, triggerInstall, initPwaInstallListener } = await import('./pwaInstall');

    const cleanup = initPwaInstallListener();
    const mockEvent = makeMockPromptEvent('dismissed');
    window.dispatchEvent(mockEvent);
    expect(get(canInstall)).toBe(true);

    const result = await triggerInstall();
    expect(result).toBe(false);
    expect(get(canInstall)).toBe(true);
    cleanup();
  });

  it('dismissInstallSheet persists to localStorage and hides the sheet', async () => {
    const { shouldShowInstallSheet, dismissInstallSheet, initPwaInstallListener } =
      await import('./pwaInstall');

    const cleanup = initPwaInstallListener();
    const mockEvent = makeMockPromptEvent();
    window.dispatchEvent(mockEvent);
    expect(get(shouldShowInstallSheet)).toBe(true);

    dismissInstallSheet();

    expect(get(shouldShowInstallSheet)).toBe(false);
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true');
    cleanup();
  });

  it('appinstalled event sets installed and clears canInstall', async () => {
    const { canInstall, initPwaInstallListener } = await import('./pwaInstall');

    const cleanup = initPwaInstallListener();
    const mockEvent = makeMockPromptEvent();
    window.dispatchEvent(mockEvent);
    expect(get(canInstall)).toBe(true);

    window.dispatchEvent(new Event('appinstalled'));
    expect(get(canInstall)).toBe(false);
    cleanup();
  });

  it('already-standalone mode sets isAppInstalled to true', async () => {
    vi.doMock('$lib/utils/platform', () => ({
      getInstallPlatform: () => 'chromium' as const,
      isStandalone: () => true,
    }));

    mockMatchMedia(true);

    const { isAppInstalled } = await import('./pwaInstall');
    expect(get(isAppInstalled)).toBe(true);
  });

  it('shouldShowInstallButton is true on Chromium when prompt is available', async () => {
    const { shouldShowInstallButton, initPwaInstallListener } = await import('./pwaInstall');

    const cleanup = initPwaInstallListener();
    expect(get(shouldShowInstallButton)).toBe(false);

    window.dispatchEvent(makeMockPromptEvent());
    expect(get(shouldShowInstallButton)).toBe(true);
    cleanup();
  });

  it('shouldShowInstallButton is true on iOS even without prompt', async () => {
    vi.doMock('$lib/utils/platform', () => ({
      getInstallPlatform: () => 'ios' as const,
      isStandalone: () => false,
    }));

    const { shouldShowInstallButton } = await import('./pwaInstall');
    expect(get(shouldShowInstallButton)).toBe(true);
  });

  it('shouldShowInstallButton is false on iOS when already installed', async () => {
    vi.doMock('$lib/utils/platform', () => ({
      getInstallPlatform: () => 'ios' as const,
      isStandalone: () => true,
    }));

    const { shouldShowInstallButton } = await import('./pwaInstall');
    expect(get(shouldShowInstallButton)).toBe(false);
  });
});
