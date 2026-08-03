// nothing here touches the graph or the source barrel, so it stays importable outside a browser

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

// the single-source shape stays supported: it is what the example plugin and every plugin written before this sends
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
