// Reading the source list off a plugin's connection payload.
//
// Split out of extractor.ts so it can be tested: that module imports the whole source barrel (and so,
// transitively, the player components and react), which cannot be loaded outside a browser. Nothing
// here touches the graph, so it stays importable on its own.

/** A short lowercase token. Origins name things across the store, the UI and the uri grammar. */
export const PLUGIN_ORIGIN_TOKEN = /^[a-z0-9][a-z0-9-]{0,31}$/

export type PluginSourceInput = {
  origin?: unknown
  originUrl?: unknown
  name?: unknown
  icon?: unknown
  color?: unknown
  isApiOnly?: unknown
  metadataOnly?: unknown
  resolvers?: unknown
}

/** Everything about a source except its resolvers, which only extractor.ts can build. */
export type PluginSourceMeta = {
  origin: string
  originUrl: string
  name: string
  icon: string | null
  color: string | null
  isApiOnly: boolean
  metadataOnly: boolean
}

export type RejectedSource = { origin: string, reason: string }

/**
 * The sources a payload declares, each validated on its own.
 *
 * A payload is either ONE source, or a `sources` list so a single package can ship a family of them
 * (an indexer package serving animetosho and nyaa, say). The single shape stays supported because it
 * is what the example plugin and every plugin written before this sends.
 *
 * A source in a family is an ordinary standalone source that happens to arrive over a shared
 * connection. So a malformed one is REPORTED and skipped, never fatal to its siblings: the same rule
 * the fan-out follows for a failing extractor and the source layer follows for a bad record. Dropping
 * the whole family because one entry is wrong would make a package strictly more fragile than the
 * same sources shipped separately, which is backwards.
 */
export const readPluginSources = (
  payload: PluginSourceInput & { sources?: unknown },
  pluginUri: string
): { sources: { meta: PluginSourceMeta, source: PluginSourceInput }[], rejected: RejectedSource[] } => {
  const incoming: PluginSourceInput[] =
    Array.isArray(payload.sources) && payload.sources.length
      ? payload.sources as PluginSourceInput[]
      : [payload]

  const sources: { meta: PluginSourceMeta, source: PluginSourceInput }[] = []
  const rejected: RejectedSource[] = []
  const claimed = new Set<string>()

  for (const source of incoming) {
    const origin = typeof source.origin === 'string' ? source.origin : ''
    if (!PLUGIN_ORIGIN_TOKEN.test(origin)) {
      rejected.push({ origin: origin || '(none)', reason: 'origin must be a short lowercase token' })
      continue
    }
    // the FIRST claim wins; a repeat is the package's own mistake and only costs that entry
    if (claimed.has(origin)) {
      rejected.push({ origin, reason: `declared twice by '${pluginUri}'` })
      continue
    }
    claimed.add(origin)
    sources.push({
      source,
      meta: {
        origin,
        originUrl: typeof source.originUrl === 'string' ? source.originUrl : '',
        name: typeof source.name === 'string' && source.name ? source.name.slice(0, 64) : origin,
        icon: typeof source.icon === 'string' ? source.icon : null,
        color: typeof source.color === 'string' ? source.color : null,
        isApiOnly: source.isApiOnly === true,
        metadataOnly: source.metadataOnly === true,
      },
    })
  }

  return { sources, rejected }
}
