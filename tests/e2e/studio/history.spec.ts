import { test, expect } from '../fixtures/auth.fixture';
import { stubStudio } from './studio-fixture';

async function createTrack(page: import('@playwright/test').Page) {
  await page.goto('/app/studio/new');
  await page.getByLabel('Project name').fill('History project');
  await page.getByRole('button', { name: 'Create project' }).click();
  const input = page.getByPlaceholder('New track').filter({ visible: true });
  await input.fill('Song');
  await input.press('Enter');
  await page.getByRole('link', { name: /Song/ }).filter({ visible: true }).click();
}

async function importSong(page: import('@playwright/test').Page, style: string, lyric: string) {
  await page.getByRole('link', { name: 'Import from Suno' }).first().click();
  await expect(page).toHaveURL(/\/app\/studio\/p1\/tracks\/t1\/import$/);
  await expect(page.getByRole('heading', { name: 'Import from Suno' })).toBeVisible();
  await page.getByLabel('Style of Music').fill(style);
  await page.getByLabel('Lyrics').fill(`[Verse]\n${lyric}`);
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText('Plan: new version')).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/studio\/p1\/tracks\/t1$/);
}

test('making an incompatible plan current asks before detaching its lyrics', async ({
  authenticatedPage: page,
}) => {
  const { currentRequests } = await stubStudio(page, true, true);
  await createTrack(page);
  await importSong(page, 'dream pop', 'First lyric');
  await importSong(page, 'dream pop, warm synths', 'Second lyric');

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible();
  const planList = page.getByRole('region', { name: 'Plan' });
  const oldPlan = planList.getByRole('button', { name: /v1 Imported/ });
  await oldPlan.click();
  await expect(page.getByRole('heading', { name: /Plan v1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Make current' }).click();
  const confirmation = page.getByRole('dialog', {
    name: "These lyrics don't fit this plan. Make the plan current without lyrics?",
  });
  await expect(confirmation).toBeVisible();
  expect(currentRequests).toEqual([{ plan_version_id: 'plan-v1' }]);
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmation).toHaveCount(0);
  expect(currentRequests).toEqual([{ plan_version_id: 'plan-v1' }]);

  await page.getByRole('button', { name: 'Make current' }).click();
  const secondConfirmation = page.getByRole('dialog', {
    name: "These lyrics don't fit this plan. Make the plan current without lyrics?",
  });
  await secondConfirmation.getByRole('button', { name: 'Make current without lyrics' }).click();
  await expect
    .poll(() => currentRequests)
    .toEqual([
      { plan_version_id: 'plan-v1' },
      { plan_version_id: 'plan-v1' },
      { plan_version_id: 'plan-v1', lyrics_version_id: null },
    ]);
  await expect(planList.getByRole('button', { name: /v1 Imported.*Current/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lyrics' }).getByText('Current')).toHaveCount(0);
});
