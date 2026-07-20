/**
 * Sender checks shared by the service worker lifecycle-message handlers.
 * This deliberately has no page-only dependencies so the service worker can
 * import it and its URL and scope rules can be tested without a worker runtime.
 */

interface WindowClientMessageSource {
  type: 'window';
  url: string;
}

function isWindowClientMessageSource(source: unknown): source is WindowClientMessageSource {
  if (typeof source !== 'object' || source === null) return false;

  const candidate = source as Record<string, unknown>;
  return candidate.type === 'window' && typeof candidate.url === 'string';
}

/** Match a registration scope by path segment, never merely by string prefix. */
export function isPathWithinScope(pathname: string, scopePathname: string): boolean {
  const normalizedScope = scopePathname.endsWith('/') ? scopePathname : `${scopePathname}/`;

  return pathname === scopePathname || pathname.startsWith(normalizedScope);
}

/**
 * Return true only for a same-origin WindowClient whose URL is within this
 * worker's registration scope. Invalid or incomplete browser-provided values
 * are treated as untrusted.
 */
export function isTrustedPwaMessageSender(
  messageOrigin: string,
  source: unknown,
  workerOrigin: string,
  registrationScope: string,
): boolean {
  if (messageOrigin !== workerOrigin || source === null || !isWindowClientMessageSource(source)) {
    return false;
  }

  try {
    const sourceUrl = new URL(source.url);
    const scopeUrl = new URL(registrationScope);

    return (
      sourceUrl.origin === scopeUrl.origin &&
      isPathWithinScope(sourceUrl.pathname, scopeUrl.pathname)
    );
  } catch {
    return false;
  }
}
