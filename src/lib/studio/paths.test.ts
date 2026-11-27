import { expect, it } from 'vitest';
import { ROUTES } from '$lib/utils/routes';
import { studioProject, studioTrack, studioTrackEdit, workspaceBack } from './paths';

it.each([
  ['/(app)/(workspace)/app/studio/[projectId]', ROUTES.studio],
  ['/(app)/(workspace)/app/studio/[projectId]/tracks/[trackId]', studioProject('p1')],
  ['/(app)/(workspace)/app/studio/[projectId]/settings', studioProject('p1')],
])('workspaceBack routes %s to %s', (routeId, expected) => {
  expect(workspaceBack(routeId, 'p1')).toBe(expected);
});

it.each([
  ['/(app)/(workspace)/app/studio/[projectId]/tracks/[trackId]/import'],
  ['/(app)/(workspace)/app/studio/[projectId]/tracks/[trackId]/history'],
  ['/(app)/(workspace)/app/studio/[projectId]/tracks/[trackId]/edit'],
])('workspaceBack returns from %s to its track', (routeId) => {
  expect(workspaceBack(routeId, 'p1', 't1')).toBe(studioTrack('p1', 't1'));
});

it('builds the song editor route', () => {
  expect(studioTrackEdit('p1', 't1')).toBe(`${studioTrack('p1', 't1')}/edit`);
});
