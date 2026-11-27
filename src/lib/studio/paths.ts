import { ROUTES } from '$lib/utils/routes';
export const studioNewProject = (artistId?: string) =>
  `${ROUTES.studio}/new${artistId ? `?artist=${encodeURIComponent(artistId)}` : ''}`;
export const studioProject = (id: string) => `${ROUTES.studio}/${encodeURIComponent(id)}`;
export const studioProjectSettings = (id: string) => `${studioProject(id)}/settings`;
export const studioTrack = (projectId: string, trackId: string) =>
  `${studioProject(projectId)}/tracks/${encodeURIComponent(trackId)}`;
export const studioTrackImport = (projectId: string, trackId: string) =>
  `${studioTrack(projectId, trackId)}/import`;
export const studioTrackEdit = (projectId: string, trackId: string) =>
  `${studioTrack(projectId, trackId)}/edit`;
export const studioTrackHistory = (projectId: string, trackId: string) =>
  `${studioTrack(projectId, trackId)}/history`;

export function workspaceBack(
  routeId: string | null | undefined,
  projectId: string,
  trackId?: string | null,
): string {
  if (
    routeId === '/(app)/(workspace)/app/studio/[projectId]/tracks/[trackId]/import' ||
    routeId === '/(app)/(workspace)/app/studio/[projectId]/tracks/[trackId]/history' ||
    routeId === '/(app)/(workspace)/app/studio/[projectId]/tracks/[trackId]/edit'
  ) {
    return trackId ? studioTrack(projectId, trackId) : studioProject(projectId);
  }
  if (
    routeId === '/(app)/(workspace)/app/studio/[projectId]/settings' ||
    routeId === '/(app)/(workspace)/app/studio/[projectId]/tracks/[trackId]'
  ) {
    return studioProject(projectId);
  }
  return ROUTES.studio;
}
