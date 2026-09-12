/**
 * The `Origin` rows, seeded at boot from the extractor definitions (2.1, the column's own comment).
 *
 * WHY A SEED AND NOT A WAIT. An `Origin` row lands today only when a source ANSWERS, and one source
 * answers nothing at all on purpose: `imdb` exists so an `imdb:tt...` handle has an origin to be
 * rendered against, since the UI builds its source rows from the registered origins and a badge with
 * no origin row is a link carried the whole way and dropped one line short of the screen
 * (`src/sources/imdb/extractor.ts`). Five sources mint that handle. The same holds for any source a
 * session never reaches: its badge is drawn from the row it never wrote.
 *
 * WHAT IT MAY NOT DO. `Origin` is a SOURCE table (2.3), so this runs at BOOT and never inside a pass:
 * the audit of 5.3 re-hashes every source row with `seq <= passStart` and a row appearing inside that
 * window is an intruder, whoever wrote it. It writes with `ON CREATE` only, so an answer that already
 * described an origin keeps its own row, a later real answer overwrites the seed (`seq` 0 is below
 * every ingest seq), and running it twice writes nothing.
 *
 * The `hash` is the content hash of `raw`, the same one the ingest stores, because the audit
 * re-derives it in JS and reports a row whose stored hash does not match its own content.
 */
import { contentHash } from './hash'
import { graphReady } from './schema'

/** The fields of an `Origin` row, which are the extractor definition's own (`extractor.ts:73-79`). */
export type OriginSeed = {
  id: string
  name: string
  url: string | null
  icon: string | null
  color: string | null
  isApiOnly: boolean
}

/** One module of `src/sources/index.ts`, as much of it as an origin row reads. */
type ExtractorModule = {
  origin?: unknown
  name?: unknown
  originUrl?: unknown
  icon?: unknown
  color?: unknown
  isApiOnly?: unknown
}

const asText = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

/**
 * Every module that declares an `origin`, as a row.
 *
 * A module missing `origin` or `name` is skipped rather than guessed at: the two are what name the
 * row and what the UI prints, and a source that declares neither is not an origin yet. The list is
 * sorted, so a seed writes the same rows in the same order on every boot.
 */
export const originSeedsFrom = (modules: Record<string, unknown>): OriginSeed[] => {
  const seeds: OriginSeed[] = []
  for (const value of Object.values(modules)) {
    const module = (value ?? {}) as ExtractorModule
    const id = asText(module.origin)
    const name = asText(module.name)
    if (!id || !name) continue
    seeds.push({
      id,
      name,
      url: asText(module.originUrl),
      icon: asText(module.icon),
      color: asText(module.color),
      isApiOnly: module.isApiOnly === true,
    })
  }
  return seeds.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Write one `Origin` row per extractor definition, and say how many are now in the table.
 *
 * `modules` is the source tree by default and is injectable for the test, which is how a case can
 * prove a seeded origin is reachable without loading 24 extractors to do it.
 */
export const seedOrigins = async (modules?: Record<string, unknown>): Promise<number> => {
  const { query } = await graphReady()
  const source = modules ?? await import('../../sources') as Record<string, unknown>
  const seeds = originSeedsFrom(source)
  if (!seeds.length) return 0
  const rows = await Promise.all(seeds.map(async seed => {
    const raw = { id: seed.id, url: seed.url, name: seed.name, icon: seed.icon, color: seed.color, isApiOnly: seed.isApiOnly }
    return { id: seed.id, raw: JSON.stringify(raw), hash: await contentHash(raw) }
  }))
  // ON CREATE alone: a source that answered owns its row, and this may never overwrite one (4.3)
  await query(
    `UNWIND $rows AS r
     MERGE (o:Origin {id: r.id})
     ON CREATE SET o.raw = r.raw, o.hash = r.hash, o.seq = cast('0' AS INT64)`,
    { rows }
  )
  const [row] = await query('MATCH (o:Origin) RETURN count(o) AS total')
  return Number(row?.total ?? 0)
}
