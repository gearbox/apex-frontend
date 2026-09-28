/**
 * Keep client-side redirects in lock-step with the API's OAuth `return_to` rule.
 * A URL, protocol-relative path, fragment, whitespace, or a backslash can all escape the app.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  return /^\/(?![/\\])[^\s#]*$/.test(value) ? value : null;
}
