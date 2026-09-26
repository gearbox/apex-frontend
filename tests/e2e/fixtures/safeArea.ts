import type { Page } from '@playwright/test';

export async function emulateSafeArea(
  page: Page,
  insets = { top: 47, right: 0, bottom: 34, left: 0 },
): Promise<void> {
  await page.addStyleTag({
    content: `:root {
      --safe-area-top: ${insets.top}px !important;
      --safe-area-right: ${insets.right}px !important;
      --safe-area-bottom: ${insets.bottom}px !important;
      --safe-area-left: ${insets.left}px !important;
    }`,
  });
}
