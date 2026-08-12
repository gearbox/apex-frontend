import type { InstallPlatform } from './platform';

export interface AppViewportHeightInput {
  visualViewportHeight?: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
  portrait: boolean;
  standalone: boolean;
  platform: InstallPlatform;
}

/**
 * Resolve the height used by the application shell.
 *
 * iOS standalone can transiently report a visual viewport shorter than the
 * physical CSS screen during layout remounts. Keep the existing screen-height
 * floor for that platform only. Android standalone must use the real visual
 * viewport because screen.height may include system UI outside the app's
 * visible area.
 */
export function resolveAppViewportHeight(input: AppViewportHeightInput): number {
  let height = input.visualViewportHeight ?? input.innerHeight;

  if (input.standalone && input.platform === 'ios') {
    const orientedScreenHeight = input.portrait
      ? Math.max(input.screenWidth, input.screenHeight)
      : Math.min(input.screenWidth, input.screenHeight);
    height = Math.max(height, orientedScreenHeight);
  }

  return Math.round(height);
}
