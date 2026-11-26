import { ApiRequestError } from '$lib/api/errors';
import { StudioProjectSetupError } from '$lib/queries/studioProjects';
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
  if (apiError.error === 'artist_busy') return m.artists_delete_busy();
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
    case 'duplicate_section_id':
      return m.studio_issue_duplicate_section_id();
    case 'tag_conflict':
      return m.studio_issue_tag_conflict();
    case 'reserved_descriptor':
      return m.studio_issue_reserved_descriptor();
    case 'reserved_delivery_tag':
      return m.studio_issue_reserved_delivery_tag();
    case 'instrumental_plan_has_lines':
      return m.studio_issue_instrumental_plan_has_lines();
    case 'total_duration_exceeded':
      return m.studio_issue_total_duration_exceeded();
    case 'unknown_section':
      return m.studio_issue_unknown_section();
    case 'duplicate_section':
      return m.studio_issue_duplicate_section();
    case 'instrumental_section_has_lines':
      return m.studio_issue_instrumental_section_has_lines();
    case 'syllable_range_inverted':
      return m.studio_issue_syllable_range_inverted();
    case 'lyrics_too_long':
      return m.studio_issue_lyrics_too_long();
    case 'requires_make_current':
      return m.studio_issue_requires_make_current();
    case 'too_many_items':
      return m.studio_import_too_many_items();
    case 'document_too_large':
      return m.studio_issue_document_too_large();
    case 'unsupported_inline_tag':
      return m.studio_issue_unsupported_inline_tag();
    default:
      return m.studio_issue_unknown({ code: issue.code });
  }
}

export function projectCreateError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  if (error instanceof StudioProjectSetupError) return m.studio_setup_error();
  if (
    studioError(error)?.error === 'project_name_conflict' ||
    studioError(error)?.error === 'document_invalid'
  )
    return '';
  return m.studio_save_error();
}
export function projectSaveError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  if (studioError(error)?.error === 'artist_not_found') return m.studio_artist_missing();
  if (
    studioError(error)?.error === 'document_invalid' ||
    studioError(error)?.error === 'project_name_conflict'
  )
    return '';
  return m.studio_save_error();
}
export function projectDisableError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  return studioError(error)?.error === 'project_has_tracks'
    ? m.studio_remove_tracks()
    : m.studio_save_error();
}
export function trackCreateError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  if (studioError(error)?.error === 'document_invalid') return '';
  return studioError(error)?.error === 'track_limit_reached'
    ? m.studio_track_limit()
    : m.studio_save_error();
}
export function trackSaveError(error: unknown): string {
  if (error == null || isHandledGlobally(error) || studioError(error)?.error === 'document_invalid')
    return '';
  return m.studio_save_error();
}
export function trackDeleteError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  return studioError(error)?.error === 'run_in_progress'
    ? m.studio_track_busy()
    : m.studio_save_error();
}
export function trackReorderError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  return studioError(error)?.error === 'track_order_mismatch'
    ? m.studio_order_changed()
    : m.studio_save_error();
}

function errorCode(error: unknown): string {
  return studioError(error)?.error ?? 'network';
}

function errorCount(error: unknown): string {
  const detail = studioError(error)?.detail;
  if (!detail || typeof detail !== 'object' || !('count' in detail)) return '0';
  const count = (detail as { count?: unknown }).count;
  return String(typeof count === 'number' && Number.isFinite(count) ? count : 0);
}

/** Explain why a plan or lyrics version cannot be deleted. */
export function versionDeleteError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  switch (errorCode(error)) {
    case 'version_is_current':
      return m.studio_history_version_current_error();
    case 'version_has_children':
      return m.studio_history_children_error({ count: errorCount(error) });
    case 'version_is_lyrics_base':
      return m.studio_history_lyrics_base_error({ count: errorCount(error) });
    case 'version_has_audio':
      return m.studio_history_audio_error({ count: errorCount(error) });
    case 'version_in_use_by_run':
      return m.studio_history_run_error();
    case 'network':
      return m.studio_history_delete_error();
    default:
      return m.studio_versions_unknown_error({ code: errorCode(error) });
  }
}

/** Explain a rejected request to change the current plan and lyrics pair. */
export function setCurrentError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  switch (errorCode(error)) {
    case 'plan_required':
      return m.studio_history_plan_required();
    case 'lyrics_incompatible_with_plan':
      return m.studio_history_lyrics_incompatible();
    case 'not_found':
    case 'plan_version_not_found':
      return m.studio_history_not_found();
    case 'network':
      return m.studio_history_set_current_error();
    default:
      return m.studio_versions_unknown_error({ code: errorCode(error) });
  }
}

/** Map deterministic Suno import failures while leaving document issues available to the page. */
export function importError(error: unknown): string {
  if (error == null || isHandledGlobally(error)) return '';
  const code = errorCode(error);
  if (code === 'document_invalid') {
    return validationIssues(error).map(issueMessage).join(' ');
  }
  if (code === 'import_invalid') {
    const issues = validationIssues(error);
    for (const issue of issues) {
      if (issue.code === 'language_required') return m.studio_import_language_required();
      if (issue.code === 'instrumental_with_lyric_lines')
        return m.studio_import_instrumental_lines();
      if (issue.code === 'reserved_tempo_tag') return m.studio_import_reserved_tempo();
      if (issue.code === 'too_many_items') return m.studio_import_too_many_items();
    }
    return issues.length ? issues.map(issueMessage).join(' ') : m.studio_import_invalid();
  }
  switch (code) {
    case 'language_required':
      return m.studio_import_language_required();
    case 'instrumental_with_lyric_lines':
      return m.studio_import_instrumental_lines();
    case 'reserved_tempo_tag':
      return m.studio_import_reserved_tempo();
    case 'version_limit_reached':
      return m.studio_import_version_limit();
    case 'too_many_items':
      return m.studio_import_too_many_items();
    case 'network':
      return m.studio_import_copy_error();
    default:
      return m.studio_import_error_code({ code });
  }
}

/** Localized meanings for the stable export warnings from the Studio contract. */
export function exportWarningMessage(code: string): string {
  switch (code) {
    case 'local_avoid_not_exportable':
      return m.studio_export_local_avoid();
    case 'section_duration_not_exportable':
      return m.studio_export_duration();
    case 'lyrics_above_recommended_length':
      return m.studio_export_long_lyrics();
    case 'style_exclude_overlap':
      return m.studio_export_overlap();
    default:
      return m.studio_export_warning_unknown({ code });
  }
}

/** Localized meanings for the stable import warnings from the Studio contract. */
export function importWarningMessage(code: string): string {
  switch (code) {
    case 'no_section_headers':
      return m.studio_import_warning_no_headers();
    case 'text_before_first_header':
      return m.studio_import_warning_before_header();
    case 'dangling_delivery':
      return m.studio_import_warning_dangling_delivery();
    case 'unknown_section_name':
      return m.studio_import_warning_unknown_section();
    case 'duplicate_descriptor':
      return m.studio_import_warning_duplicate_descriptor();
    case 'no_lyric_lines':
      return m.studio_import_warning_no_lines();
    case 'duplicate_style_item':
      return m.studio_import_warning_duplicate_style();
    case 'duplicate_tempo':
      return m.studio_import_warning_duplicate_tempo();
    default:
      return m.studio_import_warning_unknown({ code });
  }
}
