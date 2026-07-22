const LIBRARY_PATH = '/app/library';

export interface ProjectNavigationTarget {
  href: string;
  replaceState: boolean;
}

/**
 * Creates the URL transition for a project selection. The Library URL owns the
 * active filter; the activeProject store is deliberately not consulted here.
 */
export function getProjectNavigationTarget(
  currentUrl: URL,
  projectId: string | null,
): ProjectNavigationTarget {
  if (currentUrl.pathname !== LIBRARY_PATH) {
    return {
      href: projectId ? `${LIBRARY_PATH}?project=${encodeURIComponent(projectId)}` : LIBRARY_PATH,
      replaceState: false,
    };
  }

  const params = new URLSearchParams(currentUrl.searchParams);
  if (projectId) params.set('project', projectId);
  else params.delete('project');

  const search = params.toString();
  return {
    href: search ? `?${search}` : LIBRARY_PATH,
    replaceState: true,
  };
}

export function getActiveLibraryProjectId(currentUrl: URL): string | null {
  return isLibraryUrl(currentUrl) ? currentUrl.searchParams.get('project') : null;
}

export function isLibraryUrl(currentUrl: URL): boolean {
  return currentUrl.pathname === LIBRARY_PATH;
}
