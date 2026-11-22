import { ApiRequestError } from '$lib/api/errors';

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
  return issues.filter((issue) => issue.path === field || issue.path.startsWith(`${field}[`));
}

export function issueLabel(issue: StudioValidationIssue): string {
  return `${issue.path || 'form'}: ${issue.code.replaceAll('_', ' ')}`;
}
