/**
 * routeFeatureMap.ts — maps Next.js App Router patterns to LAC featureKeys.
 *
 * Used by HelpButton to surface contextual help for the current screen.
 * Keys are Next.js route segment patterns (matching usePathname() output).
 *
 * Multiple keys = multiple features shown as a scrollable list in the help panel.
 */
export const ROUTE_FEATURES: Record<string, string[]> = {
  '/record':                                          ['odio-2026-006'],
  '/record/post':                                     ['odio-2026-006', 'odio-2026-009'],
  '/bands':                                           ['odio-2026-005'],
  '/profile':                                         ['odio-2026-003'],
  '/bands/[bandId]':                                  ['odio-2026-007'],
  '/bands/[bandId]/settings':                         ['odio-2026-005', 'odio-2026-017'],
  '/bands/[bandId]/sessions':                         ['odio-2026-008'],
  '/bands/[bandId]/sessions/[sid]':                   ['odio-2026-008', 'odio-2026-012'],
  '/bands/[bandId]/sessions/[sid]/clips/[cid]':       ['odio-2026-013', 'odio-2026-012'],
  '/bands/[bandId]/sessions/[sid]/clips/[cid]/edit':  ['odio-2026-011'],
  '/share/[token]':                                   ['odio-2026-015'],
  '/lac-hub':                                         ['odio-2026-055'],
}

/**
 * Resolve a concrete pathname (from usePathname()) to a list of featureKeys.
 *
 * Tries exact match first, then falls back to pattern matching by replacing
 * dynamic segments (UUIDs, slugs) with [param] tokens.
 */
export function resolveRouteFeatures(pathname: string): string[] {
  // 1. Exact match
  if (ROUTE_FEATURES[pathname]) return ROUTE_FEATURES[pathname]

  // 2. Pattern match — replace dynamic segments with [param] placeholders
  // Segments that look like UUIDs, numbers, or long strings → [param]
  const normalized = pathname
    .split('/')
    .map(seg =>
      /^[0-9a-f-]{8,}$/i.test(seg) || /^\d+$/.test(seg) || seg.length > 20
        ? '[param]'
        : seg,
    )
    .join('/')

  // Try each ROUTE_FEATURES key, replacing its [xxx] tokens with [param]
  for (const [pattern, keys] of Object.entries(ROUTE_FEATURES)) {
    const normalizedPattern = pattern
      .split('/')
      .map(seg => (seg.startsWith('[') ? '[param]' : seg))
      .join('/')
    if (normalizedPattern === normalized) return keys
  }

  return []
}
