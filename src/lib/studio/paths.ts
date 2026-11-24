import { ROUTES } from '$lib/utils/routes';
export const studioNewProject = (artistId?: string) =>
  `${ROUTES.studio}/new${artistId ? `?artist=${encodeURIComponent(artistId)}` : ''}`;
export const studioProject = (id: string) => `${ROUTES.studio}/${encodeURIComponent(id)}`;
export const studioProjectSettings = (id: string) => `${studioProject(id)}/settings`;
export const studioTrack = (projectId: string, trackId: string) =>
  `${studioProject(projectId)}/tracks/${encodeURIComponent(trackId)}`;
