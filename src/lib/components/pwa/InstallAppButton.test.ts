import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { InstallStatus } from '$lib/stores/pwaInstall';

vi.mock('$lib/stores/pwaInstall', async () => {
  const { writable } = await import('svelte/store');
  const installStatus = writable('not_offered');
  const installPlatform = writable('chromium');
  const isInstallSheetDismissed = writable(false);
  const resetInstallSheetDismissal = vi.fn(() => isInstallSheetDismissed.set(false));
  return {
    installStatus,
    installPlatform,
    isInstallSheetDismissed,
    resetInstallSheetDismissal,
    triggerInstall: vi.fn(),
  };
});
vi.mock('$lib/stores/product', async () => {
  const { writable } = await import('svelte/store');
  return { appDisplayName: writable('Synthara') };
});
vi.mock('$lib/stores/toasts', () => ({ addToast: vi.fn() }));

import InstallAppButton from './InstallAppButton.svelte';
import {
  installStatus,
  isInstallSheetDismissed,
  resetInstallSheetDismissal,
} from '$lib/stores/pwaInstall';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  (installStatus as unknown as Writable<InstallStatus>).set('not_offered');
  (isInstallSheetDismissed as unknown as Writable<boolean>).set(false);
});

it.each([
  ['installed', 'Installed'],
  ['available', 'Install App'],
  ['ios_manual', 'Install App'],
  ['not_offered', "Your browser hasn't offered installation"],
  ['dismissed_hint', 'The install tip is hidden.'],
] as const)('always renders an explanatory row for %s', (status, content) => {
  (installStatus as unknown as Writable<InstallStatus>).set(status);
  render(InstallAppButton);
  expect(screen.getByRole('region', { name: 'Install App' })).toBeTruthy();
  expect(screen.getByText(new RegExp(content))).toBeTruthy();
});

it('resets a dismissed tip so the install sheet can be shown again', async () => {
  (installStatus as unknown as Writable<InstallStatus>).set('dismissed_hint');
  (isInstallSheetDismissed as unknown as Writable<boolean>).set(true);
  render(InstallAppButton);
  await fireEvent.click(screen.getByRole('button', { name: 'Show install tip again' }));
  expect(resetInstallSheetDismissal).toHaveBeenCalledOnce();
  expect(get(isInstallSheetDismissed)).toBe(false);
});
