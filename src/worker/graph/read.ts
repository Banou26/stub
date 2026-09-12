/**
 * THE READ PATH of section 6, behind `?store=graph`.
 *
 * Every export here is a LOOKUP: it reads JSON that `plugin:aggregate` and `plugin:containment`
 * materialized, and writes nothing. No id is minted, no alias is written, nothing is unioned, and
 * the fuzzy title pass does not run inside a page read any more: that is `plugin:title`, woken by
 * the scheduler.
 *
 * WHY THIS FILE EXISTS AT ALL, rather than living in `../resolvers/media/index.ts`. That module
 * reaches urql and, through it, a CommonJS `require('react')` no alias intercepts, so it cannot be
 * imported under vitest (`vitest.config.ts` records the measurement). Nothing here imports a resolver
 * or `../extractor.ts`, so every rule below is pinned by `tests/unit/worker/graph/read.test.ts`
 * against a real engine. The resolvers become thin switches on the read store.
 *
 * WHAT IT PROMISES.
 * - A page is at most two statements, a detail view at most four, an episode list exactly one.
 * - A statement never runs with an empty `UNWIND` list, which dies at runtime on this engine rather
 *   than returning nothing (the engine facts of 2026-09-12).
 * - Nothing it returns has been merged, filtered or sorted: `applyMediaFilters`, `searchRelevance`
 *   and `applyMediaSorts` are the caller's, unchanged, and run over the cards this hands back.
 */
import type { AggregatedEpisode, AggregatedMedia, ClusterCard } from './plugins/fields'

import { isAggregatedUri, fromAggregatedUri, type AggregatedUri } from '../../utils/uri'
import { graphReady } from './schema'

/**
 * Which store answers `mediaPage`, `media`, `Media.episodes` and `ctx.findAggregatedMedia`.
 *
 * SEPARATE FROM `?graph`, and that is the point of having two flags. `?graph` warms the engine and
 * runs the tee and the pass beside the old store, which is what the shadow of step 2 needs; this one
 * switches what the app actually READS. With it on `legacy` the graph can be fully warm and nothing a
 * user sees has moved, which is what makes the switch reversible in one query parameter.
 */
export type ReadStore = 'graph' | 'legacy'

let store: ReadStore = 'legacy'

/** Which store the reads are on. `legacy` until something switches it, `?graph` on or off. */
export const readStore = (): ReadStore => store

/**
 * Switch the reads. The caller owns turning the ENGINE on: `?store=graph` implies `?graph`, and the
 * one place that implication lives is `../yoga.ts`, so a test can move the flag without booting one.
 */
export const setReadStore = (next: ReadStore): void => { store = next }

/** One row of the page statements: the cluster, whether a listing draws it, and what it draws. */
type PageRow = {
  id: string
  hidden: boolean
  hiddenBy: string[]
  card: ClusterCard | null
}

/** The cluster a resolve landed on, before its view is read. */
type ResolvedCluster = {
  id: string
  scope: string
  preferredRun: string | null
}

const parse = <T>(value: unknown): T | null => {
  if (typeof value !== 'string' || !value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    // a column the writer could not have written: report it once and answer nothing, since throwing
    // here takes a whole page down for one corrupt row
    console.error(new Error(`graph read: a cluster column is not JSON: ${value.slice(0, 80)}`))
    return null
  }
}

// An empty `STRING[]` reads back as NULL on this engine, so every list column is normalized on the
// way out rather than at each use.
const stringsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

const pageRowOf = (row: Record<string, unknown>): PageRow => ({
  id: String(row.id),
  hidden: row.hidden === true,
  hiddenBy: stringsOf(row.hiddenBy),
  card: parse<ClusterCard>(row.card),
})

/**
 * The uris statement 1 of 6.2 asks about: an aggregated address is every member it names, and a bare
 * uri is itself.
 *
 * The address is a LIST OF SOURCES TO ASK and never a statement about how they relate (3.3), so a
 * uri in it that the graph relates to nothing simply matches no cluster here.
 */
export const addressUris = (uri: string): string[] => {
  if (isAggregatedUri(uri)) return fromAggregatedUri(uri as AggregatedUri)?.handleUris ?? []
  return uri ? [uri] : []
}

/**
 * The clusters a listing draws (6.1), as their materialized cards.
 *
 * With no uris the seed is EVERY visible cluster, and that whole-store case is load bearing rather
 * than a convenience: a page only re-reads on an event, and a second subscription over a warm store
 * fires none, so answering nothing here leaves the page empty forever (measured on the search page,
 * 2026-09-06). With uris it is their clusters plus the runs a hidden one hides behind, which is what
 * keeps a query only unogs or JustWatch answered from drawing nothing at all.
 *
 * A cluster with no card is a cluster no member of which is owned ("a placeholder cluster is never a
 * card"), and it is absent from both cases rather than drawn empty.
 */
export const pageClusters = async (uris?: readonly string[]): Promise<ClusterCard[]> => {
  const { query } = await graphReady()
  if (!uris) {
    const rows = await query('MATCH (c:Cluster) WHERE NOT c.hidden RETURN c.id AS id, c.card AS card')
    return rows.map(pageRowOf).map(row => row.card).filter((card): card is ClusterCard => card !== null)
  }
  if (!uris.length) return []

  const seeds = (await query(
    `UNWIND $uris AS u
     MATCH (m:Media {uri: u})-[:MEMBER_OF]->(c:Cluster)
     RETURN DISTINCT c.id AS id, c.hidden AS hidden, c.hiddenBy AS hiddenBy, c.card AS card`,
    { uris: [...uris] }
  )).map(pageRowOf)

  return withHiddenRuns(seeds, query)
}

/**
 * The visible cards of a seed set, plus the runs its hidden rows hide behind.
 *
 * The second hop drops ids already in hand, so a run that is both a seed and a `hiddenBy` target is
 * read once and drawn once.
 */
const withHiddenRuns = async (
  seeds: readonly PageRow[],
  query: (cypher: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>[]>
): Promise<ClusterCard[]> => {
  const drawn = new Map<string, ClusterCard>()
  const wanted = new Set<string>()
  for (const row of seeds) {
    if (!row.hidden && row.card) drawn.set(row.id, row.card)
    if (row.hidden) for (const id of row.hiddenBy) wanted.add(id)
  }
  for (const id of drawn.keys()) wanted.delete(id)
  if (wanted.size) {
    const rows = await query(
      'UNWIND $ids AS hid MATCH (c:Cluster {id: hid}) WHERE NOT c.hidden RETURN c.id AS id, c.card AS card',
      { ids: [...wanted].sort() }
    )
    for (const row of rows.map(pageRowOf)) if (row.card) drawn.set(row.id, row.card)
  }
  return [...drawn.values()]
}

/**
 * A listing that keeps its page as a map keyed on cluster id, re-read one cluster at a time (6.1).
 *
 * `read` is the whole seed, `apply` is what a `view:changed` costs: the named clusters only, never
 * the store. THE REMOVAL RULE is the half that is easy to miss. A named cluster that comes back
 * hidden, cardless or absent is DELETED from the map, because from the outside it is otherwise
 * indistinguishable from one that did not change and would sit on the page forever.
 *
 * Admitting a cluster the page never asked for is the mirror mistake, so a named cluster enters the
 * map only when the page is the whole store, or when the map already holds it, or when it holds one
 * of the uris the fan-out has answered.
 */
export const createPageReader = () => {
  const cards = new Map<string, ClusterCard>()

  const admits = (card: ClusterCard, uris: readonly string[]): boolean =>
    !uris.length || cards.has(card._id) || card.members.some(member => uris.includes(member))

  return {
    /** The seed read, which replaces the map. */
    read: async (uris: readonly string[]): Promise<ClusterCard[]> => {
      cards.clear()
      for (const card of await pageClusters(uris.length ? uris : undefined)) cards.set(card._id, card)
      return [...cards.values()]
    },
    /** One `view:changed` applied: the named clusters re-read, the removal rule run over them. */
    apply: async (ids: readonly string[], uris: readonly string[]): Promise<ClusterCard[]> => {
      if (!ids.length) return [...cards.values()]
      const { query } = await graphReady()
      const rows = (await query(
        `UNWIND $ids AS i MATCH (c:Cluster {id: i})
         RETURN c.id AS id, c.hidden AS hidden, c.hiddenBy AS hiddenBy, c.card AS card`,
        { ids: [...ids] }
      )).map(pageRowOf)

      const seen = new Set(rows.map(row => row.id))
      // absent: retired into another cluster, or never existed. Either way it is not on the page.
      for (const id of ids) if (!seen.has(id)) cards.delete(id)

      for (const row of rows) {
        if (row.hidden || !row.card) cards.delete(row.id)
        else if (admits(row.card, uris)) cards.set(row.id, row.card)
      }
      // a row that JUST became hidden takes its run's place, so the run has to be drawn in its place
      // here exactly as the seed read draws it
      for (const card of await withHiddenRuns(rows.filter(row => row.hidden), query)) {
        if (admits(card, uris) || rows.some(row => row.hidden && row.hiddenBy.includes(card._id))) {
          cards.set(card._id, card)
        }
      }
      return [...cards.values()]
    },
    /** The page as it stands, for a caller that wants it without a read. */
    cards: (): ClusterCard[] => [...cards.values()],
  }
}

const RESOLVE_COLUMNS =
  `RETURN DISTINCT c.id AS id, c.scope AS scope, c.preferredRun AS preferredRun, c.key AS key,
          CASE WHEN c.scope = 'RUN' THEN 0 ELSE 1 END AS scopeRank
   ORDER BY scopeRank, key
   LIMIT 1`

const clusterOf = (row: Record<string, unknown> | undefined): ResolvedCluster | undefined =>
  row === undefined
    ? undefined
    : {
      id: String(row.id),
      scope: String(row.scope ?? 'RUN'),
      preferredRun: typeof row.preferredRun === 'string' && row.preferredRun ? row.preferredRun : null,
    }

/**
 * Statement 1 of 6.2, and only on its empty answer statement 1a.
 *
 * MEMBERSHIP RANKS ABOVE PUBLICATION, by construction rather than by a score: a uri once published
 * under one cluster's id and now a member of its own would otherwise open the other cluster's page
 * (`mal:51535`, 8.6). `published` is append-only, so the scan below is the ONLY way a departed member
 * still resolves, and it is taken on the fallthrough and never level with membership.
 */
const resolveByUris = async (uris: readonly string[]): Promise<ResolvedCluster | undefined> => {
  if (!uris.length) return undefined
  const { query } = await graphReady()
  const [member] = await query(
    `UNWIND $uris AS u MATCH (m:Media {uri: u})-[:MEMBER_OF]->(c:Cluster) ${RESOLVE_COLUMNS}`,
    { uris: [...uris] }
  )
  if (member) return clusterOf(member)
  const [published] = await query(
    `UNWIND $uris AS u MATCH (c:Cluster) WHERE u IN c.published ${RESOLVE_COLUMNS}`,
    { uris: [...uris] }
  )
  return clusterOf(published)
}

/** Statement 1b: a cluster id, current, then retired. */
const resolveById = async (id: string): Promise<ResolvedCluster | undefined> => {
  const { query } = await graphReady()
  const [current] = await query(
    'MATCH (c:Cluster {id: $id}) RETURN c.id AS id, c.scope AS scope, c.preferredRun AS preferredRun',
    { id }
  )
  if (current) return clusterOf(current)
  const [aliased] = await query(
    `MATCH (x:Alias {id: $id}) MATCH (c:Cluster {id: x.clusterId})
     RETURN c.id AS id, c.scope AS scope, c.preferredRun AS preferredRun`,
    { id }
  )
  return clusterOf(aliased)
}

/** Whether one cluster actually holds one member uri, which is what the fallthrough of 6.2 asks. */
const holds = async (id: string, uri: string): Promise<boolean> => {
  const { query } = await graphReady()
  const rows = await query(
    'MATCH (m:Media {uri: $uri})-[:MEMBER_OF]->(c:Cluster {id: $id}) RETURN c.id AS id',
    { id, uri }
  )
  return rows.length > 0
}

/**
 * A detail view (6.2): resolve, then one lookup.
 *
 * `uri` is the decoded route uri, an aggregated address, or a cluster id, current or retired.
 * `member` is the second segment of `/media/:uri/:mediaUri`: when the first resolves to a cluster
 * that does NOT hold it, the member is resolved on its own instead, so a client holding an old `_id`
 * or an old address never silently opens a cluster its row has left.
 *
 * A CONTAINER with a `preferredRun` follows to that run, which is "a show page follows to its
 * attached run, earliest first". A REQUESTED URI IS NEVER HIDDEN: the hide rule is a listing rule and
 * is not consulted here.
 *
 * Returns undefined when no cluster resolves, which is what keeps the modal on its loading state
 * rather than on a null while the sources are still answering.
 */
export const resolveMedia = async (uri: string, member?: string): Promise<AggregatedMedia | undefined> => {
  // statement 1 then 1a over the address's members, then 1b over the same string read as a cluster
  // id: a value that is neither matches nothing in either, at the cost of two key lookups
  let resolved = await resolveByUris(addressUris(uri))
  if (!resolved && uri) resolved = await resolveById(uri)
  if (!resolved && member) resolved = await resolveByUris(addressUris(member))
  if (!resolved) return undefined

  if (member && !(await holds(resolved.id, member))) {
    const fallthrough = await resolveByUris(addressUris(member))
    if (fallthrough) resolved = fallthrough
  }

  const id = resolved.scope === 'CONTAINER' && resolved.preferredRun ? resolved.preferredRun : resolved.id
  return viewOfCluster(id)
}

/** Statement 2: the materialized view of one cluster, with the page `kind` of 6.5 beside it. */
const viewOfCluster = async (id: string): Promise<AggregatedMedia | undefined> => {
  const { query } = await graphReady()
  const [row] = await query('MATCH (c:Cluster {id: $id}) RETURN c.media AS media, c.kind AS kind', { id })
  if (!row) return undefined
  const media = parse<AggregatedMedia>(row.media)
  if (!media) return undefined
  // `kind` is the CLUSTER's column, not the view's: `plugin:containment` computes `FOLD` and
  // `aggregateFields` is not handed it, so the JSON carries the scope standing in for it. Reading it
  // from the same row costs no second statement and is what makes a folded season draw its own page.
  return typeof row.kind === 'string' && row.kind ? { ...media, kind: row.kind } : media
}

/**
 * A live detail view: the read, and the test for whether one `view:changed` concerns it (6.6).
 *
 * Two states, and the first is the one a wake on cluster ids alone would miss. Before a cluster
 * exists for the requested uri there is no id to wake on, so the subscription wakes on its REQUESTED
 * URIS until one resolves. After that it wakes on its cluster id, or on any member uri, which is how
 * a retirement reaches it: the surviving cluster's event names members the retired one held.
 */
export const createMediaReader = (uri: string, member?: string) => {
  const requested = new Set([...addressUris(uri), ...(member ? addressUris(member) : [])])
  let clusterId: string | undefined
  let wakeUris = new Set(requested)

  return {
    read: async (): Promise<AggregatedMedia | undefined> => {
      const media = await resolveMedia(uri, member)
      if (media) {
        clusterId = media._id
        wakeUris = new Set([...requested, ...await memberUrisOf([media._id])])
      }
      return media
    },
    wakes: (detail: { clusters: readonly string[], uris: readonly string[] }): boolean =>
      (clusterId !== undefined && detail.clusters.includes(clusterId)) ||
      detail.uris.some(named => wakeUris.has(named)),
    /** The cluster this reader last resolved to, for a caller that logs or keys on it. */
    clusterId: (): string | undefined => clusterId,
  }
}

/**
 * The episode list of one cluster (6.4): ONE lookup of the materialized row, never a walk from a
 * media uri, so it can never be handed a container's flat list of every season at once.
 *
 * A parent that is not a cluster answers `[]` rather than erroring, which is what a handle node is:
 * its `_id` is the member's own uri and matches no `Cluster.id`.
 *
 * ROWS WITH NO NUMBER ARE DROPPED, which is parity with today (`media/index.ts` filters
 * `episodeNumber == null`) and NOT what `Cluster.episodes` holds: a special gets its own slot and is
 * listed last. Listing specials is a visible change nobody has priced, since the modal and the watch
 * page both sort on the number and have never drawn a row without one, so it is decision 7 for the
 * owner and this read stays at parity until it is made.
 */
export const episodesOf = async (clusterId: string): Promise<AggregatedEpisode[]> => {
  if (!clusterId) return []
  const { query } = await graphReady()
  const [row] = await query('MATCH (c:Cluster {id: $id}) RETURN c.episodes AS episodes', { id: clusterId })
  if (!row) return []
  const episodes = parse<AggregatedEpisode[]>(row.episodes)
  if (!Array.isArray(episodes)) return []
  return episodes.filter(episode => episode.episodeNumber !== null && episode.episodeNumber !== undefined)
}

/** Every member uri of the named clusters, sorted and deduplicated. Empty in, empty out. */
export const memberUrisOf = async (clusterIds: readonly string[]): Promise<string[]> => {
  if (!clusterIds.length) return []
  const { query } = await graphReady()
  const rows = await query(
    'UNWIND $ids AS i MATCH (m:Media)-[:MEMBER_OF]->(c:Cluster {id: i}) RETURN m.uri AS uri',
    { ids: [...clusterIds] }
  )
  return [...new Set(rows.map(row => String(row.uri)))].sort()
}
