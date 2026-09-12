/**
 * The four invariant queries of 3.5, verbatim, and what they come to.
 *
 * They must return 0 after every pass in dev and after every harness run; a non-zero answer is an
 * anomaly naming the cluster ids (5.5), and the declared precedence retracts the weaker edge: a
 * `PART_OF` or `INCLUDES` between two members of one cluster retracts the `SAME_AS` that joined them
 * and never the containment edge, so the outcome does not depend on which plugin ran first.
 *
 * WHAT THEY CAN AND CANNOT SEE TODAY. `MEMBER_OF` is `plugin:aggregate`'s (2.3) and that plugin lands
 * later, so three of the four can only be answered once clusters exist. That is exactly why the test
 * beside them writes a membership by hand and asserts each query counts it: a check that reports zero
 * because its table is empty has told you nothing, and this file would otherwise ship as decoration.
 */
import type { GuardQuery } from './guards'

/** One invariant: the name 5.5 reports it under, and the query that decides it. */
export type Invariant = { rule: string, cypher: string }

/** The four queries of 3.5, each returning one count column. */
export const INVARIANTS: Invariant[] = [
  {
    rule: 'includes-inside',
    cypher: `MATCH (a:Media)-[:LINK {kind: 'INCLUDES', status: 'active'}]->(b:Media), (a)-[:MEMBER_OF]->(c:Cluster)<-[:MEMBER_OF]-(b)
             RETURN count(*) AS total`,
  },
  {
    rule: 'part-of-inside',
    cypher: `MATCH (a:Media)-[:LINK {kind: 'PART_OF', status: 'active'}]->(b:Media), (a)-[:MEMBER_OF]->(c:Cluster)<-[:MEMBER_OF]-(b)
             RETURN count(*) AS total`,
  },
  {
    rule: 'cross-scope-link',
    cypher: `MATCH (a:Media)-[:LINK {kind: 'SAME_AS', status: 'active'}]-(b:Media),
                   (pa:MediaProfile)-[:PROFILE_OF]->(a), (pb:MediaProfile)-[:PROFILE_OF]->(b)
             WHERE pa.scope <> pb.scope RETURN count(*) AS total`,
  },
  {
    rule: 'double-membership',
    cypher: `MATCH (m:Media)-[:MEMBER_OF]->(c:Cluster) WITH m, count(c) AS n WHERE n > 1 RETURN count(*) AS total`,
  },
]

/** What every invariant counted. `ok` is true only when all four are 0. */
export type InvariantReport = { ok: boolean, counts: Record<string, number> }

/** Run the four queries and say what they came to. */
export const checkInvariants = async (query: GuardQuery): Promise<InvariantReport> => {
  const counts: Record<string, number> = {}
  for (const invariant of INVARIANTS) {
    const [row] = await query(invariant.cypher)
    counts[invariant.rule] = Number(row?.total ?? 0)
  }
  return { ok: Object.values(counts).every(count => count === 0), counts }
}
