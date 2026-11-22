import { ApiRequestError } from '$lib/api/errors';
import * as m from '$paraglide/messages';

export interface StudioValidationIssue {
  path: string;
  code: string;
}

export function studioError(error: unknown): ApiRequestError | undefined {
  return error instanceof ApiRequestError ? error : undefined;
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
