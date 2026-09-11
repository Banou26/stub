/**
 * The corpus file format, and the only definition of it.
 *
 * A corpus case is a store-independent statement of what a set of source rows MEANS: which of them
 * describe one work and which describe different works. It names no function, imports nothing from
 * `src/`, and can be run against any implementation through the adapter in ./run.ts. See ./README.md
 * for where the cases came from and for the rule about where an expected answer may come from.
 *
 * Every field below is validated by `validateCase` and every case file is put through it by
 * `tests/unit/worker/corpus/current-store.test.ts`, because a corpus that silently skips a malformed
 * file reports a pass it never had.
 */

/** One title a source publishes, with the source's own confidence in it. */
export type CorpusTitle = {
  language: string
  title: string
  score?: number | null
}

/**
 * One source's row, store-shaped: exactly the object the test this case came from hands the store.
 *
 * The fields are the ones the merge path reads. `scope` absent means RUN, which is the default the
 * schema gives an absent scope, and it is spelled out only where the source test spelled it out.
 */
export type CorpusMedia = {
  uri: string
  origin: string
  id: string
  type?: string | null
  categories?: string[]
  titles: CorpusTitle[]
  startDate?: string | null
  /** what this source says the run is LONG, which is the number its own catalogue publishes */
  episodeCount?: number | null
  score?: number | null
  scope?: 'RUN' | 'CONTAINER'
}

/** One episode row, attached to the media that published it. */
export type CorpusEpisode = {
  uri: string
  origin: string
  id: string
  mediaUri: string
  episodeNumber: number
  releaseDate?: string | null
  score?: number | null
  titles: CorpusTitle[]
}

/**
 * One identity claim a source really makes, as the store's writers take it.
 *
 * `relation` absent means SAME_AS. A SAME_AS is an assertion that the two uris name the same work; a
 * PART_OF is an assertion that the first is contained by the second and says nothing about identity.
 */
export type CorpusClaim = {
  mediaUri: string
  handleUri: string
  relation?: 'SAME_AS' | 'PART_OF'
}

/**
 * How many DISTINCT episode numbers the cluster holding `clusterOf` may draw.
 *
 * A separate question from `together` and `apart`, and the one those two cannot ask. A cluster can be
 * exactly right about who it contains and still list somebody else's episodes, because an episode
 * arrives attached to whichever media published it: Crunchyroll models a split cour as one season, so
 * an 11 episode run held a season of 23 and a special and drew all 24 rows.
 */
export type CorpusEpisodeRows = {
  clusterOf: string
  count: number
}

export type CorpusExpectation = {
  /** Each group must come back as ONE cluster. */
  together: string[][]
  /** Within each group, no two uris may share a cluster. Most groups are a pair. */
  apart: string[][]
  episodeRows?: CorpusEpisodeRows
  /**
   * Present only when `expect` above states what the store DOES rather than what is right. The text
   * says what the right answer is and why the gap is accepted. An implementation that closes the gap
   * fails the case, and the case is what changes, not the implementation.
   */
  knownGap?: string
}

export type CorpusCase = {
  name: string
  /** Where this case was extracted from, so the original and the corpus stay readable against each other. */
  source: { file: string, test: string }
  /** Why this answer is correct, in terms of the works rather than the code. Not optional. */
  why: string
  rows: CorpusMedia[]
  claims: CorpusClaim[]
  episodes?: CorpusEpisode[]
  expect: CorpusExpectation
}

const fail = (where: string, message: string): never => {
  throw new Error(`${where}: ${message}`)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const str = (value: unknown, where: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fail(where, `expected a non-empty string, got ${JSON.stringify(value)}`)

const optionalStr = (value: unknown, where: string): string | null | undefined =>
  value === undefined || value === null || typeof value === 'string'
    ? value as string | null | undefined
    : fail(where, `expected a string, null or absent, got ${JSON.stringify(value)}`)

const optionalNum = (value: unknown, where: string): number | null | undefined =>
  value === undefined || value === null || typeof value === 'number'
    ? value as number | null | undefined
    : fail(where, `expected a number, null or absent, got ${JSON.stringify(value)}`)

const array = (value: unknown, where: string): unknown[] =>
  Array.isArray(value) ? value : fail(where, `expected an array, got ${JSON.stringify(value)}`)

const titles = (value: unknown, where: string): CorpusTitle[] =>
  array(value, where).map((entry, index) => {
    const at = `${where}[${index}]`
    if (!isRecord(entry)) return fail(at, 'expected an object')
    return {
      language: str(entry.language, `${at}.language`),
      title: str(entry.title, `${at}.title`),
      score: optionalNum(entry.score, `${at}.score`),
    }
  })

const uriGroups = (value: unknown, where: string): string[][] =>
  array(value, where).map((group, index) =>
    array(group, `${where}[${index}]`).map((uri, member) => str(uri, `${where}[${index}][${member}]`)))

/**
 * Reads one parsed case file, or throws naming the exact path that is wrong.
 *
 * Unknown keys are rejected rather than ignored: a typo in an expectation key is a case that asserts
 * nothing, which is the one failure this whole corpus exists to make impossible.
 */
export const validateCase = (value: unknown, where: string): CorpusCase => {
  if (!isRecord(value)) return fail(where, 'expected an object')
  const known = new Set(['name', 'source', 'why', 'rows', 'claims', 'episodes', 'expect'])
  for (const key of Object.keys(value)) if (!known.has(key)) fail(where, `unknown key ${key}`)

  const source = isRecord(value.source) ? value.source : fail(`${where}.source`, 'expected an object')
  const expectation = isRecord(value.expect) ? value.expect : fail(`${where}.expect`, 'expected an object')
  const knownExpect = new Set(['together', 'apart', 'episodeRows', 'knownGap'])
  for (const key of Object.keys(expectation)) if (!knownExpect.has(key)) fail(`${where}.expect`, `unknown key ${key}`)

  const rows = array(value.rows, `${where}.rows`).map((row, index) => {
    const at = `${where}.rows[${index}]`
    if (!isRecord(row)) return fail(at, 'expected an object')
    const scope = row.scope
    if (scope !== undefined && scope !== 'RUN' && scope !== 'CONTAINER') fail(`${at}.scope`, `expected RUN, CONTAINER or absent, got ${JSON.stringify(scope)}`)
    return {
      uri: str(row.uri, `${at}.uri`),
      origin: str(row.origin, `${at}.origin`),
      id: str(row.id, `${at}.id`),
      type: optionalStr(row.type, `${at}.type`),
      categories: row.categories === undefined
        ? undefined
        : array(row.categories, `${at}.categories`).map((entry, at2) => str(entry, `${at}.categories[${at2}]`)),
      titles: titles(row.titles, `${at}.titles`),
      startDate: optionalStr(row.startDate, `${at}.startDate`),
      episodeCount: optionalNum(row.episodeCount, `${at}.episodeCount`),
      score: optionalNum(row.score, `${at}.score`),
      scope: scope as 'RUN' | 'CONTAINER' | undefined,
    } satisfies CorpusMedia
  })

  const claims = array(value.claims, `${where}.claims`).map((claim, index) => {
    const at = `${where}.claims[${index}]`
    if (!isRecord(claim)) return fail(at, 'expected an object')
    const relation = claim.relation
    if (relation !== undefined && relation !== 'SAME_AS' && relation !== 'PART_OF') fail(`${at}.relation`, `expected SAME_AS, PART_OF or absent, got ${JSON.stringify(relation)}`)
    return {
      mediaUri: str(claim.mediaUri, `${at}.mediaUri`),
      handleUri: str(claim.handleUri, `${at}.handleUri`),
      relation: relation as 'SAME_AS' | 'PART_OF' | undefined,
    } satisfies CorpusClaim
  })

  const episodes = value.episodes === undefined
    ? undefined
    : array(value.episodes, `${where}.episodes`).map((episode, index) => {
      const at = `${where}.episodes[${index}]`
      if (!isRecord(episode)) return fail(at, 'expected an object')
      return {
        uri: str(episode.uri, `${at}.uri`),
        origin: str(episode.origin, `${at}.origin`),
        id: str(episode.id, `${at}.id`),
        mediaUri: str(episode.mediaUri, `${at}.mediaUri`),
        episodeNumber: typeof episode.episodeNumber === 'number'
          ? episode.episodeNumber
          : fail(`${at}.episodeNumber`, `expected a number, got ${JSON.stringify(episode.episodeNumber)}`),
        releaseDate: optionalStr(episode.releaseDate, `${at}.releaseDate`),
        score: optionalNum(episode.score, `${at}.score`),
        titles: titles(episode.titles, `${at}.titles`),
      } satisfies CorpusEpisode
    })

  const episodeRows = expectation.episodeRows === undefined
    ? undefined
    : isRecord(expectation.episodeRows)
      ? {
        clusterOf: str(expectation.episodeRows.clusterOf, `${where}.expect.episodeRows.clusterOf`),
        count: typeof expectation.episodeRows.count === 'number'
          ? expectation.episodeRows.count
          : fail(`${where}.expect.episodeRows.count`, 'expected a number'),
      }
      : fail(`${where}.expect.episodeRows`, 'expected an object')

  const parsed: CorpusCase = {
    name: str(value.name, `${where}.name`),
    source: { file: str(source.file, `${where}.source.file`), test: str(source.test, `${where}.source.test`) },
    why: str(value.why, `${where}.why`),
    rows,
    claims,
    episodes,
    expect: {
      together: uriGroups(expectation.together, `${where}.expect.together`),
      apart: uriGroups(expectation.apart, `${where}.expect.apart`),
      episodeRows,
      knownGap: expectation.knownGap === undefined ? undefined : str(expectation.knownGap, `${where}.expect.knownGap`),
    },
  }

  const described = new Set(parsed.rows.map(row => row.uri))
  const named = [
    ...parsed.expect.together.flat(),
    ...parsed.expect.apart.flat(),
    ...(parsed.expect.episodeRows ? [parsed.expect.episodeRows.clusterOf] : []),
  ]
  for (const uri of named) if (!described.has(uri)) fail(where, `expects something of ${uri}, which no row describes`)
  for (const episode of parsed.episodes ?? []) {
    if (!described.has(episode.mediaUri)) fail(where, `episode ${episode.uri} hangs off ${episode.mediaUri}, which no row describes`)
  }
  if (!parsed.expect.together.length && !parsed.expect.apart.length) fail(where, 'asserts neither together nor apart')

  return parsed
}
