import { ApiRequestError } from '$lib/api/errors';
import * as m from '$paraglide/messages';

export interface StudioValidationIssue {
  path: string;
  code: string;
}

export function issueId(controlId: string, index: number): string {
  return `${controlId}-issue-${index}`;
}

export function describedBy(
  controlId: string,
  issues: StudioValidationIssue[],
  extraIds: string[] = [],
): string | undefined {
  const ids = [...issues.map((_, index) => issueId(controlId, index)), ...extraIds];
  return ids.length ? ids.join(' ') : undefined;
}

export function studioError(error: unknown): ApiRequestError | undefined {
  return error instanceof ApiRequestError ? error : undefined;
}

/** Errors another surface already explains, such as legal re-acceptance. */
export function isHandledGlobally(error: unknown): boolean {
  return studioError(error)?.status_code === 428;
}

export function memorySaveError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  const apiError = studioError(error);
  if (apiError?.status_code === 409 && apiError.error === 'memory_limit_reached') {
    return m.studio_memory_limit_reached();
  }
  if (apiError?.status_code === 422 && apiError.error === 'document_invalid') return '';
  return m.studio_memory_save_error();
}

export function artistCreateError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  const apiError = studioError(error);
  if (!apiError) return m.artists_create_error();
  if (apiError.error === 'artist_limit_reached') return m.artists_limit_reached();
  if (apiError.error === 'artist_name_conflict' || apiError.error === 'document_invalid') return '';
  return m.artists_create_error();
}

export function artistSaveError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  const apiError = studioError(error);
  if (!apiError) return m.artists_profile_save_error();
  if (apiError.error === 'artist_name_conflict' || apiError.error === 'document_invalid') return '';
  if (apiError.error === 'artist_limit_reached') return m.artists_limit_reached();
  return m.artists_profile_save_error();
}

export function artistDeleteError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  const apiError = studioError(error);
  if (!apiError) return m.artists_delete_error();
  if (apiError.error === 'artist_in_use') {
    const detail = apiError.detail as { project_count?: number } | null;
    return m.artists_in_use({ count: String(detail?.project_count ?? 0) });
  }
  return m.artists_delete_error();
}

export function memoryStatusError(error: unknown, next: 'active' | 'archived'): string {
  if (error == null || isHandledGlobally(error)) return '';
  const apiError = studioError(error);
  if (!apiError) return m.studio_memory_update_error();
  if (apiError.error === 'memory_limit_reached' && next === 'active') {
    return m.studio_restore_limit_reached();
  }
  return m.studio_memory_update_error();
}

export function memoryDeleteError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  return m.studio_memory_delete_error();
}

export function validationIssues(error: unknown): StudioValidationIssue[] {
  const detail = studioError(error)?.detail;
  if (!detail || typeof detail !== 'object' || !('issues' in detail)) return [];
  const issues = (detail as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue: unknown) => {
    if (!issue || typeof issue !== 'object') return [];
    const { path, code } = issue as Record<string, unknown>;
    return typeof path === 'string' && typeof code === 'string' ? [{ path, code }] : [];
  });
}

export function fieldIssues(
  issues: StudioValidationIssue[],
  field: string,
): StudioValidationIssue[] {
  return issues.filter((issue) => issueField(issue) === field);
}

export function issueField(issue: StudioValidationIssue): string {
  return issue.path.split('[', 1)[0];
}

export function issueMessage(issue: StudioValidationIssue): string {
  switch (issue.code) {
    case 'empty_after_normalization':
      return m.studio_issue_empty();
    case 'too_long_after_normalization':
      return m.studio_issue_too_long();
    case 'duplicate_tag':
      return m.studio_issue_duplicate_tag();
    case 'reserved_characters':
      return m.studio_issue_reserved_characters();
    case 'reserved_tempo_tag':
      return m.studio_issue_reserved_tempo_tag();
    case 'document_too_large':
      return m.studio_issue_document_too_large();
    default:
      return m.studio_issue_invalid();
  }
}
