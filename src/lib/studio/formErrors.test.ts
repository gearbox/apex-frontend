import { describe, expect, it } from 'vitest';
import {
  describedBy,
  issueId,
  artistCreateError,
  artistDeleteError,
  artistSaveError,
  isHandledGlobally,
  issueField,
  issueMessage,
  memoryDeleteError,
  memorySaveError,
  memoryStatusError,
  projectCreateError,
  projectSaveError,
  projectDisableError,
  trackCreateError,
  trackSaveError,
  trackDeleteError,
  trackReorderError,
  versionDeleteError,
  setCurrentError,
  importError,
  exportWarningMessage,
  importWarningMessage,
} from './formErrors';
import { ApiRequestError } from '$lib/api/errors';
import { StudioProjectSetupError } from '$lib/queries/studioProjects';

function apiError(error: string, status_code: number, detail?: unknown) {
  return new ApiRequestError({
    error,
    message: error,
    status_code,
    detail,
  });
}

const legalReacceptanceError = apiError('legal_acceptance_required', 428);

describe('studio validation issues', () => {
  it.each([
    ['empty_after_normalization', 'Enter a value.'],
    ['too_long_after_normalization', 'This value is longer than allowed.'],
    ['duplicate_tag', 'This tag is already listed.'],
    ['reserved_characters', 'Square brackets are not allowed.'],
    ['reserved_tempo_tag', 'Tempo tags are not allowed here.'],
    ['document_too_large', 'The document is too large.'],
  ])('maps %s to a localized message', (code, expected) => {
    expect(issueMessage({ path: 'name', code })).toBe(expected);
  });

  it('uses a generic message for unknown codes and extracts the field before an array index', () => {
    expect(issueMessage({ path: 'name', code: 'future_validation_code' })).toBe(
      'Validation issue: future_validation_code',
    );
    expect(issueField({ path: 'themes[2]', code: 'too_long_after_normalization' })).toBe('themes');
  });
});

describe('version and current-pair error messages', () => {
  it.each([
    ['version_is_current', undefined, 'The current version cannot be deleted.'],
    [
      'version_has_children',
      { count: 2 },
      'This version has dependent child versions (2). Delete them first.',
    ],
    [
      'version_is_lyrics_base',
      { count: 3 },
      'This plan is the base for 3 lyrics version(s). Delete those first.',
    ],
    [
      'version_has_audio',
      { count: 1 },
      'This version is linked to 1 audio version(s). Clear those links or delete the audio versions first.',
    ],
    [
      'version_in_use_by_run',
      undefined,
      'This version is in use by a run. It can be deleted when the run ends.',
    ],
  ])('maps delete refusal %s', (code, detail, expected) => {
    expect(versionDeleteError(apiError(code, 409, detail))).toBe(expected);
  });
  it('maps network and unknown delete errors with a diagnosable code', () => {
    expect(versionDeleteError(new TypeError('offline'))).toContain('delete');
    expect(versionDeleteError(apiError('new_delete_code', 409))).toContain('new_delete_code');
  });
  it.each([
    ['plan_required', 'A plan is required before lyrics can be current.'],
    ['lyrics_incompatible_with_plan', 'These lyrics do not fit the current plan.'],
    ['not_found', 'This version could not be found.'],
    ['plan_version_not_found', 'This version could not be found.'],
  ])('maps set current error %s', (code, expected) => {
    expect(setCurrentError(apiError(code, 409))).toBe(expected);
  });
});

describe('Suno import errors and warning messages', () => {
  it.each([
    ['language_required', 'Add a language before previewing lyrics.'],
    ['instrumental_with_lyric_lines', 'These lyrics have lines while Instrumental is on.'],
    [
      'reserved_tempo_tag',
      'A saved Style tag looks like a tempo. Move the plan tag to Tempo or remove the artist tag, then import again.',
    ],
    ['version_limit_reached', 'This track has reached its version limit.'],
    ['too_many_items', 'This paste contains more items than Studio allows.'],
  ])('maps import failure %s', (code, expected) => {
    expect(importError(apiError(code, 422))).toBe(expected);
  });
  it('maps import issues and retains unknown error codes', () => {
    expect(
      importError(
        apiError('import_invalid', 422, {
          issues: [{ path: 'lyrics[2]', code: 'instrumental_section_has_lines' }],
        }),
      ),
    ).toBe('An instrumental section cannot contain lyric lines.');
    expect(
      importError(
        apiError('import_invalid', 422, {
          issues: [{ path: 'lyrics[2]', code: 'unsupported_inline_tag' }],
        }),
      ),
    ).toBe(
      'Remove square brackets from lyric text or make the whole line a section or delivery tag.',
    );
    expect(importError(apiError('future_import_code', 422))).toContain('future_import_code');
  });
  it.each([
    ['local_avoid_not_exportable', 'Section avoid tags are not sent to Suno.'],
    ['section_duration_not_exportable', 'Planned section duration is not sent to Suno.'],
    ['lyrics_above_recommended_length', 'Suno may rush lyrics longer than 3,000 characters.'],
    ['style_exclude_overlap', 'A tag appears in both Style and Exclude.'],
  ])('maps export warning %s', (code, expected) => {
    expect(exportWarningMessage(code)).toBe(expected);
  });
  it.each([
    ['no_section_headers', 'No section headers were found; the lyrics will become one verse.'],
    ['text_before_first_header', 'Text before the first header will become an implicit verse.'],
    ['dangling_delivery', 'A delivery tag without a lyric line will be dropped.'],
    ['unknown_section_name', 'This section name is unknown and will be kept as an interlude.'],
    ['duplicate_descriptor', 'Repeated descriptors will be collapsed.'],
    ['no_lyric_lines', 'No lyric lines were found.'],
    ['duplicate_style_item', 'Repeated Style or Exclude items will be dropped.'],
    ['duplicate_tempo', 'Only the first tempo item will be kept.'],
  ])('maps import warning %s', (code, expected) => {
    expect(importWarningMessage(code)).toBe(expected);
  });
  it('includes unknown warning codes in the fallback', () => {
    expect(exportWarningMessage('future_export_code')).toContain('future_export_code');
    expect(importWarningMessage('future_import_warning')).toContain('future_import_warning');
  });
});

describe('isHandledGlobally', () => {
  it('recognizes legal re-acceptance errors', () => {
    expect(isHandledGlobally(legalReacceptanceError)).toBe(true);
    expect(isHandledGlobally(apiError('server_error', 500))).toBe(false);
    expect(isHandledGlobally(new TypeError('Network unavailable'))).toBe(false);
  });
});

describe('memorySaveError', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    [legalReacceptanceError, ''],
    [
      apiError('memory_limit_reached', 409),
      'This artist has 200 active memories. Archive one before adding another.',
    ],
    [apiError('document_invalid', 422), ''],
    [apiError('server_error', 500), 'We could not save this memory. Please try again.'],
    [new TypeError('Network unavailable'), 'We could not save this memory. Please try again.'],
  ])('maps %s', (error, expected) => {
    expect(memorySaveError(error)).toBe(expected);
  });
});

describe('artistCreateError', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    [new TypeError('Network unavailable'), 'We could not create this artist. Please try again.'],
    [legalReacceptanceError, ''],
    [
      apiError('artist_limit_reached', 409),
      'You can have up to 50 artists. Delete an artist before creating another.',
    ],
    [apiError('artist_name_conflict', 409), ''],
    [apiError('document_invalid', 422), ''],
    [apiError('server_error', 500), 'We could not create this artist. Please try again.'],
  ])('maps %s', (error, expected) => {
    expect(artistCreateError(error)).toBe(expected);
  });
});

describe('artistSaveError', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    [new TypeError('Network unavailable'), 'We could not save the artist profile.'],
    [legalReacceptanceError, ''],
    [apiError('artist_name_conflict', 409), ''],
    [apiError('document_invalid', 422), ''],
    [
      apiError('artist_limit_reached', 409),
      'You can have up to 50 artists. Delete an artist before creating another.',
    ],
    [apiError('server_error', 500), 'We could not save the artist profile.'],
  ])('maps %s', (error, expected) => {
    expect(artistSaveError(error)).toBe(expected);
  });
});

describe('artistDeleteError', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    [new TypeError('Network unavailable'), 'We could not delete this artist.'],
    [legalReacceptanceError, ''],
    [
      apiError('artist_in_use', 409, { project_count: 3 }),
      'This artist is used by 3 project(s). Remove the artist from them first.',
    ],
    [apiError('artist_busy', 409), 'This artist is finishing a reply. Try again in a few seconds.'],
    [apiError('server_error', 500), 'We could not delete this artist.'],
  ])('maps %s', (error, expected) => {
    expect(artistDeleteError(error)).toBe(expected);
  });
});

describe('memoryStatusError', () => {
  it.each([
    [null, 'archived', ''],
    [undefined, 'active', ''],
    [new TypeError('Network unavailable'), 'archived', 'We could not update this memory.'],
    [legalReacceptanceError, 'active', ''],
    [
      apiError('memory_limit_reached', 409),
      'active',
      '200 active memories is the limit. Archive one to restore this.',
    ],
    [apiError('memory_limit_reached', 409), 'archived', 'We could not update this memory.'],
    [apiError('server_error', 500), 'archived', 'We could not update this memory.'],
  ])('maps %s for next status %s', (error, next, expected) => {
    expect(memoryStatusError(error, next as 'active' | 'archived')).toBe(expected);
  });
});

describe('memoryDeleteError', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    [new TypeError('Network unavailable'), 'We could not delete this memory.'],
    [legalReacceptanceError, ''],
    [apiError('server_error', 500), 'We could not delete this memory.'],
  ])('maps %s', (error, expected) => {
    expect(memoryDeleteError(error)).toBe(expected);
  });
});

describe('describedBy', () => {
  it('returns undefined when empty and joins issue and extra ids', () => {
    expect(describedBy('field', [])).toBeUndefined();
    expect(
      describedBy(
        'field',
        [
          { path: 'name', code: 'invalid' },
          { path: 'name', code: 'empty' },
        ],
        ['hint'],
      ),
    ).toBe('field-issue-0 field-issue-1 hint');
    expect(issueId('field', 1)).toBe('field-issue-1');
  });
});

describe('project and track errors', () => {
  it('maps setup and project failures', () => {
    expect(projectCreateError(new StudioProjectSetupError('p', new Error()))).toBe(
      "The project was created but Studio couldn't be set up. Try again.",
    );
    expect(projectCreateError(apiError('project_name_conflict', 409))).toBe('');
    expect(projectSaveError(apiError('artist_not_found', 404))).toContain('artist');
    expect(projectSaveError(apiError('document_invalid', 422))).toBe('');
    expect(projectDisableError(apiError('project_has_tracks', 409))).toContain('tracks');
  });
  it('maps track failures', () => {
    expect(trackCreateError(apiError('track_limit_reached', 409))).toContain('64');
    expect(trackCreateError(apiError('document_invalid', 422))).toBe('');
    expect(trackSaveError(apiError('document_invalid', 422))).toBe('');
    expect(trackDeleteError(apiError('run_in_progress', 409))).toContain('run in progress');
    expect(trackReorderError(apiError('track_order_mismatch', 422))).toContain('refreshed');
  });
});
