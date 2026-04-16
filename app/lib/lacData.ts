/**
 * lacData.ts — typed accessor for /lac/lac-data.json
 *
 * Fetches once, caches in memory. Works in client components only
 * (server components can read the file directly via fs).
 *
 * Usage:
 *   const feature = await getLacFeature('odio-2026-006')
 *   const recording = await getLacFeatures('recording')
 */

export interface LacViewUser {
  userGuide?: string
  knownLimitations?: string[]
  problem?: string
  successCriteria?: string
  tags?: string[]
}

export interface LacViewDev {
  componentFile?: string
  implementation?: string
  implementationNotes?: string
  codeSnippets?: Array<{ label: string; code: string }>
  decisions?: Array<{ date: string; choice: string; rationale: string }>
  externalDependencies?: string[]
  testStrategy?: string
  npmPackages?: string[]
  publicInterface?: Array<{ name: string; type: string; description?: string }>
}

export interface LacViewProduct {
  problem?: string
  successCriteria?: string
  acceptanceCriteria?: string[]
  decisions?: Array<{ date: string; choice: string; rationale: string }>
  pmSummary?: string
  knownLimitations?: string[]
  releaseVersion?: string
}

export interface LacViewSupport {
  knownLimitations?: string[]
  annotations?: string[]
  problem?: string
}

export interface LacFeatureEntry {
  featureKey: string
  title: string
  status: 'draft' | 'active' | 'frozen' | 'deprecated'
  domain: string
  tags: string[]
  priority?: number
  externalDependencies: string[]
  views: {
    user?: LacViewUser
    dev?: LacViewDev
    product?: LacViewProduct
    support?: LacViewSupport
  } & Record<string, Record<string, unknown> | undefined>
}

export interface LacDataExport {
  meta: {
    projectName: string
    generatedAt: string
    lacVersion: string
    featureCount: number
    domains: string[]
    definedViews: string[]
  }
  features: LacFeatureEntry[]
}

// ── Client-side cache ─────────────────────────────────────────────────────────

let _cache: LacDataExport | null = null
let _fetchPromise: Promise<LacDataExport> | null = null

async function loadData(dataUrl = '/lac/lac-data.json'): Promise<LacDataExport> {
  if (_cache) return _cache
  if (_fetchPromise) return _fetchPromise

  _fetchPromise = fetch(dataUrl)
    .then(r => {
      if (!r.ok) throw new Error(`Failed to load ${dataUrl}: ${r.status}`)
      return r.json() as Promise<LacDataExport>
    })
    .then(data => {
      _cache = data
      return data
    })

  return _fetchPromise
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Get a single feature by its featureKey. Returns null if not found. */
export async function getLacFeature(
  key: string,
  dataUrl?: string,
): Promise<LacFeatureEntry | null> {
  const data = await loadData(dataUrl)
  return data.features.find(f => f.featureKey === key) ?? null
}

/** Get all features, optionally filtered by domain. */
export async function getLacFeatures(
  domain?: string,
  dataUrl?: string,
): Promise<LacFeatureEntry[]> {
  const data = await loadData(dataUrl)
  if (!domain) return data.features
  return data.features.filter(f => f.domain === domain)
}

/** Full-text search across title, problem, userGuide, tags. */
export async function searchLacFeatures(
  query: string,
  dataUrl?: string,
): Promise<LacFeatureEntry[]> {
  const data = await loadData(dataUrl)
  const q = query.toLowerCase()
  return data.features.filter(f => {
    if (f.title.toLowerCase().includes(q)) return true
    if (f.domain?.toLowerCase().includes(q)) return true
    if (f.tags?.some(t => t.toLowerCase().includes(q))) return true
    if (f.views.user?.problem?.toLowerCase().includes(q)) return true
    if (f.views.user?.userGuide?.toLowerCase().includes(q)) return true
    return false
  })
}
