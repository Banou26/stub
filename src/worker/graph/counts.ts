/**
 * The row count of every table, so a page can be asked what the ingest produced.
 *
 * It exists for the same reason `?export=answers` does: what a real 24-source fan-out writes cannot
 * be measured from a fixture, and a number read off the page is the only thing that proves the tee
 * ran at all. Behind the same flag, reachable as `window.__stubGraphCounts()` (`src/answers-export.ts`).
 *
 * It promises the counts INCLUDE whatever is still queued: the answer log's pending window is flushed
 * first, and the ingest runs inside that flush, so a caller never reads a half-written page. It
 * refuses to answer with zeros when the graph is off, because an empty graph and a graph that was
 * never enabled are different facts about a session.
 *
 * It then waits out the PASS that flush woke, so the plugin tables of 2.2 are read at a fixed point
 * rather than half written: the flush ends in a `graph:changed`, which is a pass, and a count taken
 * between the two would report the ingest's rows with none of the rows they produce. With no
 * scheduler started the wait is free, since nothing is ever in flight.
 */
import { graphEnabled } from './engine'
import { flushAnswers } from './answers'
import { passSettled } from './scheduler'
import { graphReady, GRAPH_NODE_TABLES, GRAPH_REL_TABLES } from './schema'

/** Every table of section 2, in creation order, with the number of rows or edges it holds. */
export const graphCounts = async (): Promise<Record<string, number>> => {
  if (!graphEnabled()) throw new Error('graph: the graph is off, load the page with ?graph=1')
  await flushAnswers()
  await passSettled()
  const { query } = await graphReady()
  const counts: Record<string, number> = {}
  for (const table of GRAPH_NODE_TABLES) {
    const rows = await query(`MATCH (n:${table}) RETURN count(n) AS total`)
    counts[table] = Number(rows[0]?.total ?? 0)
  }
  for (const table of GRAPH_REL_TABLES) {
    const rows = await query(`MATCH ()-[e:${table}]->() RETURN count(e) AS total`)
    counts[table] = Number(rows[0]?.total ?? 0)
  }
  return counts
}
