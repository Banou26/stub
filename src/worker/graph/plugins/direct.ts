/**
 * `plugin:direct`, P1 of 5.4: the claims a SOURCE made, turned into proposals and edges.
 *
 * It decides nothing about similarity. Every row it emits is one `CLAIMS` edge read through the
 * derivation table of `db.ts:166-169`, kept verbatim, plus the same-origin rule and the fenced
 * `INCLUDES`; the union-by-id pairs (mal, anilist, kitsu, anizip, offline, simkl agree by first-party
 * ids) need no matching at all. `supports` is the claim's own key, so a trace descends from the link
 * to the claim and from there to the `Answer` that carried it.
 *
 * WHAT IT PROMISES. Same graph, same output: the scan is ordered, the decision is a pure function of
 * the claim and the two profiles, and nothing here reads a clock, a score or another plugin's link.
 * Whether a `SAME_AS` proposal becomes an edge is not its call: the writer's guards decide, a refusal
 * is written with its reason, and six of the nine refusals write the containment edge instead (5.2).
 *
 * ITS FAILURE MODE, stated because it is the reason guards 4 and 5 exist. A per-run origin that is
 * show-level for a MINORITY of its ids welds two runs the moment both claim it: `mal:51535` sits on
 * both Attack on Titan Final Chapters parts, while `idMal` is per-run for about 99.7% of ids and
 * blocking `mal` outright would cost 3,184 correct merges (2026-09-01). The guards catch it when the
 * two parts' own anilist and kitsu ids meet, and both sides downgrade (8.6). Two wrong `SAME_AS`
 * between rows whose origins never disagree still weld, as today; the weld is an edge with a
 * `supports` list, deletable, and reported the moment a later id disagrees.
 */
import type { LinkProposal, Plugin, PluginContext, PluginOutput } from './contract'

/** The version of 5.1: bumped when a rule below changes, which retracts and recomputes every row. */
export const DIRECT_VERSION = 1

/** One row of the candidate scan of 5.4 P1: a claim and the two profiles the table reads. */
export type Candidate = {
  fromUri: string
  toUri: string
  fromOrigin: string
  toOrigin: string
  kind: string
  claimer: string
  provenance: string
  claimKey: string
  fromScope: string | null
  toScope: string | null
  fromParent: string | null
  toParent: string | null
}

const asText = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

/**
 * The candidate scan of 5.4 P1, verbatim, with the one shape change the step needs: `delta.claims`
 * arrives in 2c, so the whole-graph form runs until it does and the keyed form is kept beside it.
 */
const scan = async (ctx: PluginContext, claimKeys: string[] | undefined): Promise<Candidate[]> => {
  const projection = `RETURN a.uri AS fromUri, b.uri AS toUri, a.origin AS fromOrigin, b.origin AS toOrigin,
       c.kind AS kind, c.claimer AS claimer, c.provenance AS provenance, c.key AS claimKey,
       pa.scope AS fromScope, pb.scope AS toScope, pa.idParent AS fromParent, pb.idParent AS toParent
     ORDER BY fromUri, toUri, kind, claimer`
  const rows = claimKeys === undefined
    ? await ctx.query<Record<string, unknown>>(
      `MATCH (a:Media)-[c:CLAIMS]->(b:Media)
       MATCH (pa:MediaProfile)-[:PROFILE_OF]->(a), (pb:MediaProfile)-[:PROFILE_OF]->(b)
       ${projection}`
    )
    // an empty `UNWIND` list dies at runtime on this engine, so an empty delta asks nothing
    : claimKeys.length === 0 ? []
    : await ctx.query<Record<string, unknown>>(
      `UNWIND $claimKeys AS k
       MATCH (a:Media)-[c:CLAIMS {key: k}]->(b:Media)
       MATCH (pa:MediaProfile)-[:PROFILE_OF]->(a), (pb:MediaProfile)-[:PROFILE_OF]->(b)
       ${projection}`,
      { claimKeys }
    )
  return rows.map(row => ({
    fromUri: String(row.fromUri),
    toUri: String(row.toUri),
    fromOrigin: String(row.fromOrigin),
    toOrigin: String(row.toOrigin),
    kind: String(row.kind),
    claimer: String(row.claimer),
    provenance: String(row.provenance),
    claimKey: String(row.claimKey),
    fromScope: asText(row.fromScope),
    toScope: asText(row.toScope),
    fromParent: asText(row.fromParent),
    toParent: asText(row.toParent),
  }))
}

const proposal = (
  candidate: Candidate,
  kind: LinkProposal['kind'],
  fromUri: string,
  toUri: string,
  reason: string,
  extra: { status?: 'refused', evidence?: unknown } = {}
): LinkProposal => ({
  kind,
  fromUri,
  toUri,
  ...extra.status ? { status: extra.status } : {},
  reason,
  confidence: 1.0,
  // the claimer and the provenance travel on every row this plugin writes: they are what the
  // precedence classes of 5.2 read, and what a trace prints beside the claim key
  evidence: extra.evidence ?? { claimer: candidate.claimer, provenance: candidate.provenance },
  supports: [candidate.claimKey],
})

/**
 * One claim as the decision table of 5.4 P1 reads it, or nothing when it waits.
 *
 * The table, in the order it is applied:
 *
 * | claim | scopes | verdict |
 * | --- | --- | --- |
 * | any | `fromScope` or `toScope` NULL | no edge this pass; replayed next pass |
 * | any, `provenance = address` | | never consumed here (3.3) |
 * | `INCLUDES` | `fromOrigin = toOrigin` and `toParent = fromUri` | `PART_OF(toUri, fromUri)` reason `asserted` |
 * | `INCLUDES` | otherwise | refused `foreign-includes`, no downgrade |
 * | any, `fromOrigin = toOrigin` | `toUri = fromParent` or `fromUri = toParent` | `PART_OF` from the extending id to its prefix, reason `prefix` |
 * | any, `fromOrigin = toOrigin` | otherwise | refused `disagreeing-ids` and downgraded |
 * | `PART_OF` | RUN into RUN, or RUN into CONTAINER | `PART_OF` as claimed, reason `asserted` (an `ask` claim carries `containing`) |
 * | `PART_OF` | CONTAINER into RUN | refused `inverted` |
 * | `SAME_AS` | equal | propose `SAME_AS`: the writer's guards decide |
 * | `SAME_AS` | differ | `PART_OF` from the RUN side to the CONTAINER side, reason `cross-scope` |
 *
 * TWO ORDERING CHOICES the table's own rows do not fix, both made so a more specific rule keeps its
 * own reason: `INCLUDES` is read before the same-origin rule, since a show's own season list is
 * exactly a same-origin prefix pair and `asserted` says more than `prefix` about it; and the
 * same-origin rule is read before the kind rules, since `cr:<series>-<season>` claiming
 * `cr:<series>` is prefix containment whether it was offered as `SAME_AS` or as `PART_OF`.
 */
export const decide = (candidate: Candidate): LinkProposal[] => {
  const { fromUri, toUri, fromOrigin, toOrigin, kind, fromScope, toScope, fromParent, toParent } = candidate

  // a uri with no effective scope has no relation yet: the claim edge stays and the next pass, with
  // the row that describes it, decides (5.2 guard 1, `db.ts:113-123`)
  if (fromScope === null || toScope === null) return []
  // an address is a POINTER: it names which sources to ask and asserts nothing about how they relate
  if (candidate.provenance === 'address') return []

  if (kind === 'INCLUDES') {
    // fenced: a show row naming the season rows of its OWN origin, inside its own id space
    if (fromOrigin === toOrigin && toParent === fromUri) {
      return [proposal(candidate, 'PART_OF', toUri, fromUri, 'asserted', {
        evidence: { claimer: candidate.claimer, provenance: candidate.provenance, claimed: 'INCLUDES' },
      })]
    }
    // an ordinal or a season list is never portable between id spaces: JustWatch and Netflix disagree
    // on the season number for 6 of 31 shows (2026-09-04). No downgrade, because nothing was proven
    return [proposal(candidate, 'INCLUDES', fromUri, toUri, 'foreign-includes', { status: 'refused' })]
  }

  if (fromOrigin === toOrigin) {
    // specificity is PREFIX EXTENSION, never length (`src/utils/uri.ts:23-34`, fc36ffc)
    if (toUri === fromParent) return [proposal(candidate, 'PART_OF', fromUri, toUri, 'prefix')]
    if (fromUri === toParent) return [proposal(candidate, 'PART_OF', toUri, fromUri, 'prefix')]
    // two ids of one origin that are not one id at two precisions: refused, and downgraded, so the
    // url survives as containment while the identity does not. A claim that was already CONTAINMENT
    // is only the downgrade: writing a refused `PART_OF` beside an active one of the same reason
    // would be two rows fighting for one key, which the diff resolves by the array's order
    const downgrade = proposal(candidate, 'PART_OF', fromUri, toUri, 'disagreeing-ids', {
      evidence: { claimer: candidate.claimer, provenance: candidate.provenance, theirs: toUri, ours: fromUri },
    })
    if (kind === 'PART_OF') return [downgrade]
    return [proposal(candidate, 'SAME_AS', fromUri, toUri, 'disagreeing-ids', { status: 'refused' }), downgrade]
  }

  if (kind === 'PART_OF') {
    // a CONTAINER proposed as part of a RUN is refused rather than flipped (`db.ts:244-245`)
    if (fromScope === 'CONTAINER' && toScope === 'RUN') {
      return [proposal(candidate, 'PART_OF', fromUri, toUri, 'inverted', { status: 'refused' })]
    }
    // a `containing` answer is an ask, and it names the counts it read (4.4)
    const reason = candidate.provenance === 'ask' ? 'containing' : 'asserted'
    return [proposal(candidate, 'PART_OF', fromUri, toUri, reason)]
  }

  if (fromScope !== toScope) {
    // "an edge media to handle, whatever was claimed" (`db.ts:166-169`)
    const [run, container] = fromScope === 'RUN' ? [fromUri, toUri] : [toUri, fromUri]
    return [proposal(candidate, 'PART_OF', run, container, 'cross-scope', {
      evidence: { claimer: candidate.claimer, provenance: candidate.provenance, theirs: 'CONTAINER', ours: 'RUN' },
    })]
  }

  return [proposal(candidate, 'SAME_AS', fromUri, toUri, 'asserted')]
}

/**
 * `plugin:direct`, P1 of 5.4.
 *
 * Consumes `CLAIMS` and `MediaProfile`; produces `LINK` of kinds `SAME_AS` and `PART_OF` (and the
 * refused `INCLUDES` row a fenced claim leaves); `after: [plugin:profile]`, because every decision
 * reads the effective scope and the id parent off the profile rather than off `raw`.
 */
export const directPlugin: Plugin = {
  id: 'plugin:direct',
  consumes: { nodes: ['MediaProfile'], edges: ['CLAIMS'] },
  produces: { nodes: [], edges: ['LINK'], kinds: ['SAME_AS', 'PART_OF'] },
  after: ['plugin:profile'],
  version: DIRECT_VERSION,
  run: async (ctx: PluginContext): Promise<PluginOutput> => {
    // step 2c fills `delta`; until then `full` is true and the scan takes every claim in the graph
    const claimKeys = ctx.delta.full ? undefined : ctx.delta.claims
    const candidates = await scan(ctx, claimKeys)
    const links: LinkProposal[] = []
    for (const candidate of candidates) links.push(...decide(candidate))

    // the scope: the claims this run read, both endpoints of each, so a scoped pass retracts exactly
    // what it recomputed and nothing about the rest of the graph (5.1)
    const uris = new Set<string>()
    for (const candidate of candidates) {
      uris.add(candidate.fromUri)
      uris.add(candidate.toUri)
    }
    return {
      scope: claimKeys === undefined ? { full: true } : { full: false, uris: [...uris], clusters: [], pairs: [] },
      nodes: [],
      edges: [],
      links,
      episodeLinks: [],
    }
  },
}
