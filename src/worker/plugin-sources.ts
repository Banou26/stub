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

/**
 * The sources a payload declares, validated.
 *
 * A payload is either ONE source, or a `sources` list so a single package can ship a family of them
 * (an indexer package serving animetosho and nyaa, say). The single shape stays supported because it
 * is what the example plugin and every plugin written before this sends.
 *
 * Throws rather than dropping a bad entry: registration is all-or-nothing, so a package cannot
 * half-register and leave the app serving an inconsistent subset of what it claimed.
 */
export const readPluginSources = (
  payload: PluginSourceInput & { sources?: unknown },
  pluginUri: string
): { meta: PluginSourceMeta, source: PluginSourceInput }[] => {
  const incoming: PluginSourceInput[] =
    Array.isArray(payload.sources) && payload.sources.length
      ? payload.sources as PluginSourceInput[]
      : [payload]

  const read = incoming.map(source => {
    const origin = typeof source.origin === 'string' ? source.origin : ''
    if (!PLUGIN_ORIGIN_TOKEN.test(origin)) {
      throw new Error(`plugin '${pluginUri}': origin must be a short lowercase token`)
    }
    return {
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
    }
  })

  // Caught here rather than at the registry's collision check, which would report the package as
  // colliding with itself and read as "someone else already took that origin".
  const duplicate = read.find((entry, index) =>
    read.findIndex(other => other.meta.origin === entry.meta.origin) !== index)
  if (duplicate) throw new Error(`plugin '${pluginUri}': declares origin '${duplicate.meta.origin}' twice`)

  return read
}
