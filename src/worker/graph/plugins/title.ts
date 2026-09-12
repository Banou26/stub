/**
 * `plugin:title`, P3 of 5.4: two clusters that agree on a title, and what that agreement is allowed
 * to do.
 *
 * IT IS THE FUZZY PASS MOVED, NOT REWRITTEN. Every threshold, the tier selection, the trailing-number
 * rule, the companion rule and the similarity call come from `src/worker/store/fuzzy-merge.ts` and
 * `src/sources/utils.ts` BY IMPORT, so while both passes exist they cannot disagree about what 0.9
 * means. What is NEW is the record: the old pass returned a boolean and left nothing behind, and this
 * one writes the verdict, the four gate outcomes and the evidence onto the `LINK` row (2.2, 5.2), so
 * "why are these one card" and "why are these two" are both queries.
 *
 * WHAT IT PROPOSES, AND WHAT IT NEVER DECIDES. It proposes `SAME_AS` and nothing else. A verdict
 * between a run cluster and a container cluster is proposed exactly the same way, and the WRITER
 * downgrades it to `PART_OF` reason `cross-scope` (5.2): "a title match between a run and a show is a
 * guess at containment, so it rides an edge, never a union: the edge can be deleted, a union cannot"
 * (`fuzzy-merge.ts:660-666`). Whether a proposal becomes an edge is never this file's call, which is
 * what lets the guards add what the fuzzy pass never had (disagreeing ids, the count veto, the
 * contained check).
 *
 * WHAT IT PROMISES. Same graph, same scope, same output: every scan is ordered, every set the gates
 * read is a function of the cluster's members rather than of their arrival order, the six titles are
 * selected by the measured rule (`fuzzy-merge.ts:215-219`), and the pair is ordered before it is
 * compared so the evidence names the same two titles whichever side the scan reached first.
 *
 * THE STICKY HALF, and the reason it is not optional here. An active `SAME_AS` this plugin wrote has
 * already been spent: `plugin:aggregate` closed over it, so its two clusters ARE one cluster by the
 * next iteration and the pair it was derived from no longer exists to be re-derived. The writer's
 * desired set is the whole of what this plugin owns, so a link it does not re-propose is DELETED,
 * the clusters split, the pair reappears, and the pass oscillates until the cap. So every active
 * `SAME_AS` this plugin owns is re-proposed from the row it already wrote, with its own evidence and
 * gates, and the guards weigh it again: "an active SAME_AS is re-checked against guards 2 and 4 to 9
 * and retracted only when a guard now fails... Profile drift never retracts: a title link whose pair
 * no longer clears 0.9 after a member's titles changed stays active" (5.2, the sticky rule).
 *
 * THE 2C HOOK. `delta` is not built yet, so both scans run over EVERY cluster rather than over the
 * dirty set and its bucket mates. The statements are the anchored ones of 5.4 P3 with `$clusters`
 * being every id, which is the form the spec states for the full pass: a key lookup per cluster
 * rather than a list scan per row.
 *
 * THE KNOWN GAP SURVIVES, deliberately. Both silent-side vetoes only ever block on a DISAGREEMENT, so
 * `86` and `86 Part 2`, one naming a season and one not, both dated by a year alone, still weld on
 * their shared label. Closing it costs one wrong weld stopped per 37 correct merges destroyed
 * (`fuzzy-merge.ts:405-427`), and the broadcast-quarter veto that would reach 583 of 1,095 such pairs
 * is unmeasured for cost. It is pinned as a gap in `tests/unit/worker/graph/plugins/title.test.ts`.
 */
import type { Gate, LinkProposal, Plugin, PluginContext, PluginOutput } from './contract'

import {
  differOnlyByTrailingNumber, MAX_TITLES_PER_CLUSTER, namesCompanionContent, selectByScore,
  SIMILARITY_THRESHOLD, START_DATE_WINDOW_DAYS,
} from '../../store/fuzzy-merge'

/** The version of 5.1: bumped when a rule below changes, which retracts and recomputes every row. */
export const TITLE_VERSION = 1

/**
 * The bound on the decision cache, and the one thing about it that is new (5.4 P3).
 *
 * The figure is the fuzzy pass's own (`fuzzy-merge.ts:13`). What changes is what happens at it: that
 * pass CLEARS the whole map, which throws away every entry still worth keeping and re-pays the wasm
 * loop for all of them on the next pass. This one evicts the least recently used entry and nothing
 * else.
 *
 * MEASURED on the 800 row corpus replay, 2026-09-12: 298 clusters over 56 year buckets is 23,664
 * pairs and 24,359 cache entries, so ONE recorded page fills half the bound. The count is quadratic
 * in the biggest bucket rather than in the graph (that page's 2026 bucket is almost all of it), so a
 * session-sized graph passes the limit and the eviction rule starts to matter, which is the whole
 * reason it is an eviction rather than a wipe.
 */
export const MAX_CACHED_DECISIONS = 50_000

/** One title key of one member, as `plugin:profile` wrote it into the JSON `titleKeys` (2.2). */
type TitleKeyEntry = { key: string, score: number | null, class: string }

/** One member of one cluster: its cluster, and the profile columns the gates read (5.4 P3). */
export type TitleMemberRow = {
  cluster: string
  clusterScope: string
  uri: string
  memberScope: string | null
  dateSubject: string | null
  titleKeys: unknown
  year: number | null
  startDay: number | null
  format: string | null
  workKind: string | null
  seasonOrdinal: number | null
  partOrdinal: number | null
  companion: boolean | null
}

/**
 * Everything the decision reads off one cluster, and nothing that depends on the order of its members.
 *
 * The five sets are the fuzzy pass's `ClusterProfile` fields under their new names (`titles`,
 * `formats`, `seasons`, `days`, `types`), read off `MediaProfile` instead of off `Media.raw`.
 */
export type ClusterTitleProfile = {
  id: string
  scope: 'RUN' | 'CONTAINER'
  /**
   * The member a link is made THROUGH: the lowest uri whose own scope is the cluster's. A cluster
   * holding a row that was unioned as a run and has flipped CONTAINER since is scoped RUN, and
   * linking through its container member is how two runs that agreed on title and year could never
   * union (`fuzzy-merge.ts:103-109`).
   */
  linkUri: string
  /** The six of `MAX_TITLES_PER_CLUSTER`, by score descending then title ascending within a tier. */
  titles: string[]
  keys: Set<string>
  years: Set<number>
  days: Set<number>
  formats: Set<string>
  workKinds: Set<string>
  seasons: Set<number>
  /** Whether any member title ends in a companion marker: the cheap half of gate 4's premise. */
  companion: boolean
  /** The five fields the gates read plus the cluster's identity: the decision cache's key half. */
  cacheKey: string
}

/** The four gates 2.2 keeps on the row, in the order 5.4 P3 lists them. */
export type TitleGates = { format: Gate, season: Gate, date: Gate, companion: Gate }

/** Which gate refused, if one did: the `reason` a refused row is written with. */
export type TitleGateName = keyof TitleGates

/** The two titles a pair matched on, and what they scored. */
export type TitleMatch = { titleA: string, titleB: string, similarity: number, exact: boolean }

/** One pair's verdict, exactly as it is cached and as it is emitted. */
export type TitleDecision = {
  gates: TitleGates
  refusedBy: TitleGateName | null
  match: TitleMatch | undefined
  year: number | null
  daysDelta: number | null
}

const GATE_ORDER: TitleGateName[] = ['format', 'season', 'date', 'companion']

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const asText = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)
const asNumber = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string' || !value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/** The MAIN keys of one member, off the JSON column. Only MAIN exists today, and only MAIN is read. */
const keysOf = (value: unknown): TitleKeyEntry[] => {
  const parsed = parseJson(value)
  if (!Array.isArray(parsed)) return []
  const entries: TitleKeyEntry[] = []
  for (const entry of parsed as Record<string, unknown>[]) {
    const key = asText(entry?.key)
    if (!key) continue
    const entryClass = asText(entry?.class) ?? 'MAIN'
    if (entryClass !== 'MAIN') continue
    entries.push({ key, score: asNumber(entry?.score), class: entryClass })
  }
  return entries
}

/**
 * The clusters as the decision reads them, grouped from one ordered scan.
 *
 * YEARS AND DAYS COME FROM THE MEMBERS THE DATES ARE ABOUT, which is `dateSubject` (5.4 P0): a RUN
 * cluster reads its run-subject members, so a container member's premiere never buckets a run, and a
 * CONTAINER cluster reads its container-subject members, which are the only dates it has. 5.4 P3
 * states the first half ("from RUN-scoped members only"); reading nothing at all for a container
 * cluster would delete the run-to-show attach the record requires and the container badges it feeds
 * (`linkPartOfPairs`, `fuzzy-merge.ts:656-666`), so the rule is stated here as the subject rather
 * than as the scope.
 *
 * Every other set is read from EVERY member, exactly as `profileCluster` reads them.
 */
export const profileClusters = (rows: TitleMemberRow[]): Map<string, ClusterTitleProfile> => {
  const grouped = new Map<string, TitleMemberRow[]>()
  for (const row of rows) {
    const members = grouped.get(row.cluster)
    if (members) members.push(row)
    else grouped.set(row.cluster, [row])
  }

  const profiles = new Map<string, ClusterTitleProfile>()
  for (const [id, members] of grouped) {
    const scope = members.every(member => member.clusterScope === 'CONTAINER') ? 'CONTAINER' : 'RUN'
    const subject = scope === 'CONTAINER' ? 'container' : 'run'
    const bestScore = new Map<string, number>()
    const years = new Set<number>()
    const days = new Set<number>()
    const formats = new Set<string>()
    const workKinds = new Set<string>()
    const seasons = new Set<number>()
    let companion = false
    for (const member of members) {
      for (const entry of keysOf(member.titleKeys)) {
        const score = entry.score ?? -1
        const current = bestScore.get(entry.key)
        if (current === undefined || score > current) bestScore.set(entry.key, score)
      }
      if (member.dateSubject === subject) {
        const year = asNumber(member.year)
        const day = asNumber(member.startDay)
        if (year !== null) years.add(year)
        if (day !== null) days.add(day)
      }
      const format = asText(member.format)
      const workKind = asText(member.workKind)
      // ONE ordinal per member, the season when the titles named one and the part otherwise. The
      // fuzzy pass has a single set built by `parseSeasonNumber` over every raw title, which reads
      // "Part 2" as 2 exactly as it reads "Season 2" (`fuzzy-merge.ts:326-332`), and 5.4 P0 split
      // that one reading into two columns; taking the season first is the leftmost match the one
      // parser made, and falling back to the part is what keeps "Mushoku Tensei Part 2" an ordinal
      // rather than a silence, which is the whole of the gate's benefit on split cours
      const season = asNumber(member.seasonOrdinal) ?? asNumber(member.partOrdinal)
      if (format) formats.add(format)
      if (workKind) workKinds.add(workKind)
      if (season !== null) seasons.add(season)
      if (member.companion === true) companion = true
    }
    const titles = selectByScore(bestScore)
    const uris = members.map(member => member.uri).sort(compare)
    const linkUri =
      members
        .filter(member => (member.memberScope === 'CONTAINER' ? 'CONTAINER' : 'RUN') === scope)
        .map(member => member.uri)
        .sort(compare)[0] ?? uris[0]!
    profiles.set(id, {
      id,
      scope,
      linkUri,
      titles,
      keys: new Set(titles),
      years,
      days,
      formats,
      workKinds,
      seasons,
      companion,
      // the same five fields and the same joins as `fuzzy-merge.ts:344-360`: the key has to identify
      // the SET the verdict depends on, so one logical cluster keeps one entry however its members
      // arrived. A separator can never appear inside a key, because a key is letters, numbers and
      // single spaces and nothing else (`stripTitle`)
      cacheKey: `${id}#${[...titles].sort(compare).join(',')}#${[...formats].sort(compare).join(',')}#${
        [...seasons].sort((a, b) => a - b).join(',')}#${[...days].sort((a, b) => a - b).join(',')}#${
        [...workKinds].sort(compare).join(',')}`,
    })
  }
  return profiles
}

const disjoint = <T>(a: Set<T>, b: Set<T>): boolean => ![...a].some(entry => b.has(entry))

/**
 * The four gates of 5.4 P3 that are recorded, each as `passed`, `refused` or `silent`.
 *
 * SILENCE IS THE PREMISE FAILING, never a verdict: a gate whose rule needs both sides to say
 * something and meets a side that says nothing has NOTHING TO SAY, and saying it is what keeps
 * "silence never blocks" readable off the row instead of inferable from its absence. Making silence
 * block was modelled and refused at 323 wrong welds against 12,007 correct merges, one per 37
 * (`fuzzy-merge.ts:405-427`).
 *
 * `passed` therefore covers both "they agree" and "they disagree and the rule does not fire on a
 * disagreement alone", which is gate 4: the marker alone destroys 77 correct merges and the type
 * disagreement alone 547, while the two together refuse 49 of 84 for 2 (`fuzzy-merge.ts:507-518`).
 */
export const gatesFor = (a: ClusterTitleProfile, b: ClusterTitleProfile): TitleGates => ({
  format:
    a.formats.size && b.formats.size ? (disjoint(a.formats, b.formats) ? 'refused' : 'passed') : 'silent',
  season:
    a.seasons.size && b.seasons.size ? (disjoint(a.seasons, b.seasons) ? 'refused' : 'passed') : 'silent',
  date:
    a.days.size && b.days.size
      ? ([...a.days].some(dayA => [...b.days].some(dayB => Math.abs(dayA - dayB) <= START_DATE_WINDOW_DAYS))
        ? 'passed'
        : 'refused')
      : 'silent',
  companion:
    a.workKinds.size && b.workKinds.size
      ? (disjoint(a.workKinds, b.workKinds) && (a.companion || b.companion)
        && namesCompanionContent(a.titles, b.titles)
        ? 'refused'
        : 'passed')
      : 'silent',
})

/**
 * Gate 5, the title itself: the first pair of the two sixes that agrees, in one fixed order.
 *
 * Two skips before the wasm call, both measured. A trailing number is compared as a VALUE, because
 * `yami shibai 16` against `17` scores 0.8849 while `onii-chan!` against `oniichan` scores 1.0 and no
 * threshold tells them apart (`fuzzy-merge.ts:388-397`). `maxPossibleSimilarity` is the exact upper
 * bound, so a pair that cannot reach 0.9 never pays for an alignment.
 *
 * The scorers come from the context rather than from an import, which is the contract's rule: every
 * plugin prices a pair the way the record measured it (`PluginContext.titleSimilarity`).
 */
export const titleMatch = async (
  a: ClusterTitleProfile,
  b: ClusterTitleProfile,
  ctx: Pick<PluginContext, 'titleSimilarity' | 'maxPossibleSimilarity'>
): Promise<TitleMatch | undefined> => {
  for (const titleA of a.titles) {
    for (const titleB of b.titles) {
      if (titleA === titleB) return { titleA, titleB, similarity: 1, exact: true }
      if (differOnlyByTrailingNumber(titleA, titleB)) continue
      if (ctx.maxPossibleSimilarity(titleA, titleB) < SIMILARITY_THRESHOLD) continue
      const similarity = await ctx.titleSimilarity(titleA, titleB)
      if (similarity >= SIMILARITY_THRESHOLD) return { titleA, titleB, similarity, exact: false }
    }
  }
  return undefined
}

/**
 * The pair in the one order everything downstream reads it in.
 *
 * A run before a container, so the proposal the writer downgrades already points from the run to the
 * show; otherwise the lower `linkUri` first, which is the fuzzy pass's own link ordering and the
 * reason it is not the bucket's (`fuzzy-merge.ts:623-633`, "the SEQUENCE of unions decides root
 * survival"). The title loop, the evidence and the cache key all read this order, so a pair has one
 * verdict however the scan reached it.
 */
export const orderPair = (
  a: ClusterTitleProfile,
  b: ClusterTitleProfile
): [ClusterTitleProfile, ClusterTitleProfile] => {
  if (a.scope !== b.scope) return a.scope === 'RUN' ? [a, b] : [b, a]
  return compare(a.linkUri, b.linkUri) <= 0 ? [a, b] : [b, a]
}

/** The lowest year both clusters carry, which is the bucket the pair was compared in (gate 0). */
const sharedYear = (a: ClusterTitleProfile, b: ClusterTitleProfile): number | null => {
  let lowest: number | null = null
  for (const year of a.years) {
    if (!b.years.has(year)) continue
    if (lowest === null || year < lowest) lowest = year
  }
  return lowest
}

/** How far apart the two closest start days are, or nothing when either side named none (gate 3). */
const daysApart = (a: ClusterTitleProfile, b: ClusterTitleProfile): number | null => {
  let closest: number | null = null
  for (const dayA of a.days) {
    for (const dayB of b.days) {
      const delta = Math.abs(dayA - dayB)
      if (closest === null || delta < closest) closest = delta
    }
  }
  return closest
}

/**
 * A bounded cache that evicts ONE entry, never all of them (5.4 P3, **NEW**).
 *
 * A `Map` iterates in insertion order, so re-inserting on a hit is what moves an entry to the young
 * end and `keys().next()` is the old end. What this replaces is `pairDecisions.clear()` at the limit
 * (`fuzzy-merge.ts:611`), which on the pass after a merge threw away every verdict the next pass was
 * about to ask for again.
 */
export type DecisionCache = {
  get: (key: string) => TitleDecision | undefined
  set: (key: string, value: TitleDecision) => void
  readonly size: number
}

export const createDecisionCache = (limit: number): DecisionCache => {
  const entries = new Map<string, TitleDecision>()
  return {
    get: key => {
      const value = entries.get(key)
      if (value === undefined) return undefined
      entries.delete(key)
      entries.set(key, value)
      return value
    },
    set: (key, value) => {
      entries.delete(key)
      entries.set(key, value)
      while (entries.size > limit) {
        const oldest = entries.keys().next()
        if (oldest.done) break
        entries.delete(oldest.value)
      }
    },
    get size() {
      return entries.size
    },
  }
}

/** The pass's own cache, kept across passes because a verdict about unmoved clusters cannot move. */
export const titleDecisions = createDecisionCache(MAX_CACHED_DECISIONS)

/** One pair's verdict: the four gates, the title, and the two numbers the evidence carries. */
export const decide = async (
  first: ClusterTitleProfile,
  second: ClusterTitleProfile,
  ctx: Pick<PluginContext, 'titleSimilarity' | 'maxPossibleSimilarity'>,
  cache: DecisionCache = titleDecisions
): Promise<TitleDecision> => {
  const key = `${first.cacheKey}|${second.cacheKey}`
  const cached = cache.get(key)
  if (cached) return cached
  const gates = gatesFor(first, second)
  // EVERY gate is evaluated even once one has refused, because all four are recorded and they are set
  // operations on sets this pass already holds. The title is evaluated too, and that is the one place
  // the cost argument of `fuzzy-merge.ts:8-11` is weighed again: a veto that blocked a pair whose
  // titles never matched refused NOTHING, and writing it as a refusal would fill the table with pairs
  // that share a year and nothing else. Only the pairs a veto actually saved are written, and the two
  // skips above keep the wasm call for the few whose titles could reach 0.9 anyway.
  const decision: TitleDecision = {
    gates,
    refusedBy: GATE_ORDER.find(gate => gates[gate] === 'refused') ?? null,
    match: await titleMatch(first, second, ctx),
    year: sharedYear(first, second),
    daysDelta: daysApart(first, second),
  }
  cache.set(key, decision)
  return decision
}

/** One proposal as 5.4 P3 emits it: the evidence, the gates, the confidence and the two keys. */
export const proposalFor = (
  first: ClusterTitleProfile,
  second: ClusterTitleProfile,
  decision: TitleDecision
): LinkProposal | undefined => {
  if (!decision.match) return undefined
  const { titleA, titleB, similarity, exact } = decision.match
  return {
    kind: 'SAME_AS',
    fromUri: first.linkUri,
    toUri: second.linkUri,
    ...decision.refusedBy ? { status: 'refused' as const } : {},
    reason: decision.refusedBy ?? (exact ? 'exact' : 'similar'),
    confidence: similarity,
    evidence: { titleA, titleB, similarity, year: decision.year, daysDelta: decision.daysDelta },
    gates: decision.gates,
    // the two `HAS_KEY` keys, which for this edge table IS the title (`plugin:profile` keys a
    // `HAS_KEY` row on the key itself), so a trace descends from the link to the two rows that hold it
    supports: [titleA, titleB],
  }
}

/** The one read of the clusters: every member, with the profile columns the gates read. */
export const MEMBER_SCAN =
  `MATCH (m:Media)-[:MEMBER_OF]->(c:Cluster)
   MATCH (p:MediaProfile)-[:PROFILE_OF]->(m)
   RETURN c.id AS cluster, c.scope AS clusterScope, m.uri AS uri, p.scope AS memberScope,
     p.dateSubject AS dateSubject, p.titleKeys AS titleKeys, p.year AS year, p.startDay AS startDay,
     p.format AS format, p.workKind AS workKind, p.seasonOrdinal AS seasonOrdinal,
     p.partOrdinal AS partOrdinal, p.companion AS companion
   ORDER BY cluster, uri`

/**
 * Candidate scan A of 5.4 P3, exact agreement: which clusters share a MAIN key inside one year bucket.
 *
 * One join through one `TitleKey` node rather than a pairwise loop, which is what `TitleKey` and
 * `HAS_KEY` exist for (2.2). Anchored on `$clusters` rather than self-joined over every `HAS_KEY`,
 * so with `delta` it becomes a key lookup per dirty cluster and nothing about the statement changes.
 *
 * The date subject is spelled out rather than fixed to `run` for the reason `profileClusters` gives:
 * the two forms have to agree about which members carry a cluster's year, or the exact scan and the
 * bucket would disagree about what a bucket is.
 */
export const EXACT_SCAN =
  `UNWIND $clusters AS cid
   MATCH (ca:Cluster {id: cid})<-[:MEMBER_OF]-(a:Media)-[:HAS_KEY {class: 'MAIN'}]->(t:TitleKey)<-[:HAS_KEY {class: 'MAIN'}]-(b:Media)-[:MEMBER_OF]->(cb:Cluster)
   WHERE cb.id <> ca.id
   MATCH (pa:MediaProfile)-[:PROFILE_OF]->(:Media)-[:MEMBER_OF]->(ca),
     (pb:MediaProfile)-[:PROFILE_OF]->(:Media)-[:MEMBER_OF]->(cb)
   WHERE pa.year IS NOT NULL AND pb.year = pa.year
     AND ((ca.scope = 'CONTAINER' AND pa.dateSubject = 'container') OR (ca.scope <> 'CONTAINER' AND pa.dateSubject = 'run'))
     AND ((cb.scope = 'CONTAINER' AND pb.dateSubject = 'container') OR (cb.scope <> 'CONTAINER' AND pb.dateSubject = 'run'))
   RETURN DISTINCT ca.id AS fromCluster, cb.id AS toCluster, t.key AS shared, pa.year AS year
   ORDER BY fromCluster, toCluster, shared`

/** The active `SAME_AS` rows this plugin already wrote: the sticky half, read back as proposals. */
const CARRY_SCAN =
  `MATCH (a:Media)-[l:LINK]->(b:Media)
   WHERE l.by = $by AND l.kind = 'SAME_AS' AND l.status = 'active'
   RETURN a.uri AS fromUri, b.uri AS toUri, l.reason AS reason, l.confidence AS confidence,
     l.evidence AS evidence, l.gates AS gates, l.supports AS supports
   ORDER BY fromUri, toUri`

const pairKey = (a: string, b: string): string => (compare(a, b) <= 0 ? `${a} ${b}` : `${b} ${a}`)

/**
 * `plugin:title`, P3 of 5.4.
 *
 * Consumes `Cluster`, `MEMBER_OF`, `MediaProfile`, `TitleKey` and `HAS_KEY`; produces `LINK` of kind
 * `SAME_AS`, and `PART_OF` because that is what the writer's downgrade writes under this plugin's own
 * id (5.2). `after: [plugin:aggregate, plugin:containment]`: a cluster is what it compares, and the
 * containment edges are what guard 6 refuses it on.
 */
export const titlePlugin: Plugin = {
  id: 'plugin:title',
  consumes: { nodes: ['Cluster', 'MediaProfile', 'TitleKey'], edges: ['MEMBER_OF', 'HAS_KEY'] },
  produces: { nodes: [], edges: ['LINK'], kinds: ['SAME_AS', 'PART_OF'] },
  after: ['plugin:aggregate', 'plugin:containment'],
  version: TITLE_VERSION,
  run: async (ctx: PluginContext): Promise<PluginOutput> => {
    const profiles = profileClusters(await ctx.query<TitleMemberRow>(MEMBER_SCAN))

    // THE YEAR BUCKETS of gate 0, built from the profiles this pass already holds rather than by
    // asking the engine for the same rows a second time. A cluster with no title is skipped, and a
    // cluster whose members all carry first-of-month dates still has a year and is bucketed, since
    // the year survives a coercion while `startDay` does not (5.4 P0)
    const buckets = new Map<number, string[]>()
    for (const profile of profiles.values()) {
      if (!profile.titles.length) continue
      for (const year of profile.years) {
        const bucket = buckets.get(year)
        if (bucket) bucket.push(profile.id)
        else buckets.set(year, [profile.id])
      }
    }

    const pairs = new Map<string, [string, string]>()
    for (const year of [...buckets.keys()].sort((a, b) => a - b)) {
      const bucket = [...buckets.get(year)!].sort(compare)
      for (let i = 0; i < bucket.length; i += 1) {
        for (let j = i + 1; j < bucket.length; j += 1) pairs.set(pairKey(bucket[i]!, bucket[j]!), [bucket[i]!, bucket[j]!])
      }
    }

    // SCAN A, the exact shortcut. On the full pass it is a strict subset of the buckets above, and it
    // is run anyway for two reasons: it is the anchor an incremental pass keeps (5.4 P3), and the
    // cap has to be applied to it in JS or the exact path would be a WIDER arm than the one that was
    // measured, since the shipped shortcut reads the capped six (`fuzzy-merge.ts:215-219`)
    const clusters = [...profiles.keys()].sort(compare)
    let exactPairs = 0
    // an empty `UNWIND` list dies at runtime on this engine, so an empty graph asks nothing
    const exact = clusters.length
      ? await ctx.query<{ fromCluster: string, toCluster: string, shared: string }>(EXACT_SCAN, { clusters })
      : []
    for (const row of exact) {
      const a = profiles.get(String(row.fromCluster))
      const b = profiles.get(String(row.toCluster))
      if (!a || !b) continue
      const shared = String(row.shared)
      if (!a.keys.has(shared) || !b.keys.has(shared)) continue
      exactPairs += 1
      pairs.set(pairKey(a.id, b.id), [a.id, b.id])
    }

    const links: LinkProposal[] = []
    const proposed = new Set<string>()
    let refusals = 0
    for (const [a, b] of [...pairs.keys()].sort(compare).map(key => pairs.get(key)!)) {
      const [first, second] = orderPair(profiles.get(a)!, profiles.get(b)!)
      const decision = await decide(first, second, ctx)
      const proposal = proposalFor(first, second, decision)
      if (!proposal) continue
      if (decision.refusedBy) refusals += 1
      proposed.add(pairKey(proposal.fromUri, proposal.toUri))
      links.push(proposal)
    }

    // THE STICKY HALF: an active link of this plugin's has already been spent on a merge, so its pair
    // is one cluster now and cannot be re-derived. It is re-proposed as it stands and the guards weigh
    // it again, which is the only thing that may retract it (5.2, the sticky rule)
    let carried = 0
    for (const row of await ctx.query<Record<string, unknown>>(CARRY_SCAN, { by: ctx.id })) {
      const fromUri = String(row.fromUri)
      const toUri = String(row.toUri)
      if (proposed.has(pairKey(fromUri, toUri))) continue
      carried += 1
      links.push({
        kind: 'SAME_AS',
        fromUri,
        toUri,
        reason: asText(row.reason) ?? 'exact',
        confidence: asNumber(row.confidence) ?? 1,
        evidence: parseJson(row.evidence) ?? null,
        gates: parseJson(row.gates) as TitleGates | undefined,
        // an empty STRING[] reads back as NULL on this engine, so the list is normalized here
        supports: Array.isArray(row.supports) ? row.supports.map(String) : [],
      })
    }

    ctx.log({
      level: 'info',
      rule: 'title-scan',
      detail: `${profiles.size} clusters, ${buckets.size} year buckets, ${pairs.size} pairs (${exactPairs} through the exact key), ${links.length - carried} proposals of which ${refusals} refused by a gate, ${carried} carried, cache ${titleDecisions.size}`,
    })

    // THE 2C HOOK: with no `delta` the scan is every cluster, so the scope is every row this plugin
    // owns and the diff is over the whole of its output
    return { scope: { full: true }, nodes: [], edges: [], links, episodeLinks: [] }
  },
}
