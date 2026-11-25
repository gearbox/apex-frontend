import { expect, it } from 'vitest';
import { ROUTES } from '$lib/utils/routes';
import { studioProject, workspaceBack } from './paths';

it.each([
  ['/(app)/(workspace)/app/studio/[projectId]', ROUTES.studio],
  ['/(app)/(workspace)/app/studio/[projectId]/tracks/[trackId]', studioProject('p1')],
  ['/(app)/(workspace)/app/studio/[projectId]/settings', studioProject('p1')],
])('workspaceBack routes %s to %s', (routeId, expected) => {
  expect(workspaceBack(routeId, 'p1')).toBe(expected);
});
