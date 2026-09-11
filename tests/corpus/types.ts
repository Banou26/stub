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
  /**
   * The source's answer as recorded, kept BESIDE the store-shaped fields above rather than in place
   * of them.
   *
   * Its intended writer is the season walk: `scripts/walk-season-answers.mjs` records every raw source
   * answer as a row of `answers.jsonl` (`{key, seq, uri, origin, kind, operation, selection, raw}`),
   * and a case built from the walk copies that row's own `raw` here and names the `key`s it was built
   * from in `source.answers`. Nothing validates the shape, because it is whatever the source returned
   * and the point of keeping it is that it was not reshaped.
   */
  raw?: unknown
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

/**
 * The container relation: the part's cluster is ATTACHED to the whole's cluster, and never merged into it.
 *
 * Both halves are asserted, because either alone is passed by something wrong. A store that merges the
 * two satisfies "attached" trivially and has lost the distinction the edge model rests on (3.1): a
 * Crunchyroll season that holds two cours is not either cour, and a run that is part of a show is not
 * the show.
 */
export type CorpusPartOf = {
  part: string
  whole: string
}

/**
 * An episode range, the form the specification writes in 3.4: the container's episodes
 * `fromStart..fromEnd` ARE the run's `toStart..toEnd`.
 *
 * The two sides must name the same number of episodes, which `validateCase` enforces. Crunchyroll's
 * Mushoku Tensei season 1 carries two of these, 1..11 onto 1..11 and 12..23 onto 1..12 (8.1).
 */
export type CorpusEpisodeRange = {
  fromStart: number
  fromEnd: number
  toStart: number
  toEnd: number
}

/**
 * The container holds the run, and with a `range`, WHICH of the container's episodes the run is.
 *
 * A containment with no correspondence is a `partOf` and never a rangeless `includes`: 3.1 keeps the
 * two apart so that "the season holds this run" can never be read as "these episodes are those
 * episodes". A case that knows only the first states only the first.
 */
export type CorpusIncludes = {
  container: string
  run: string
  range?: CorpusEpisodeRange
}

/**
 * Two episode rows, named by an expectation that they are, or are not, one broadcast episode.
 *
 * Both uris are EPISODE uris and both must be described by the case's own `episodes`, because an
 * expectation about a row nobody wrote down is not checkable.
 */
export type CorpusEpisodePair = {
  a: string
  b: string
}

export type CorpusExpectation = {
  /** Each group must come back as ONE cluster. */
  together: string[][]
  /** Within each group, no two uris may share a cluster. Most groups are a pair. */
  apart: string[][]
  episodeRows?: CorpusEpisodeRows
  /**
   * The part's cluster is attached to the whole's cluster as a container relation, and never merged
   * into it. Needs a `checked` stamp.
   */
  partOf?: CorpusPartOf[]
  /**
   * The container holds the run; with a range, the container's episodes `fromStart..fromEnd` are the
   * run's `toStart..toEnd`. Needs a `checked` stamp.
   */
  includes?: CorpusIncludes[]
  /** Each pair is ONE broadcast episode published twice. Needs a `checked` stamp. */
  episodePairs?: CorpusEpisodePair[]
  /**
   * Each pair is two DIFFERENT episodes that must never be drawn as one row. An inserted special is
   * the case this exists for: it pairs with nothing, so every candidate is named here. Needs a
   * `checked` stamp.
   */
  episodeApart?: CorpusEpisodePair[]
  /**
   * Rows the implementation must neither merge nor attach, in either direction: the row stays a lone
   * badge carrying its own url (3.3). Needs a `checked` stamp.
   */
  unrelated?: string[]
  /**
   * Present only when `expect` above states what the store DOES rather than what is right. The text
   * says what the right answer is and why the gap is accepted. An implementation that closes the gap
   * fails the case, and the case is what changes, not the implementation.
   */
  knownGap?: string
}

/**
 * Who decided this case's answers, and when.
 *
 * REQUIRED on any case carrying `partOf`, `includes`, `episodePairs`, `episodeApart` or `unrelated`,
 * and optional on the cases lifted off the four original suites, whose provenance is the test file
 * already named in `source`. A case with one of those expectations and no stamp fails validation,
 * because an unchecked assertion is not a label: it is a guess with a file name.
 */
export type CorpusChecked = {
  /** Who decided it. A person, or the record the answer was read out of. */
  by: string
  /** The day it was decided, as YYYY-MM-DD. */
  at: string
  /** What a later reader needs: how the rows were built, and which numbers the record did not carry. */
  notes?: string
}

export type CorpusCase = {
  name: string
  /**
   * Where this case was extracted from, so the original and the corpus stay readable against each other.
   *
   * `answers` is for a case built from the season walk: it names the `key` of every `answers.jsonl`
   * row the case was built from, so the raw answers behind it can be found again without rerunning the
   * walk. `answers.jsonl` is deduped on `key`, so a key names exactly one answer.
   */
  source: { file: string, test: string, answers?: string[] }
  /** Why this answer is correct, in terms of the works rather than the code. Not optional. */
  why: string
  rows: CorpusMedia[]
  claims: CorpusClaim[]
  episodes?: CorpusEpisode[]
  expect: CorpusExpectation
  checked?: CorpusChecked
  /**
   * Present only while no implementation can yet be ASKED the case's container, range and episode
   * expectations. The text names what is waited on, for example `new store`.
   *
   * The harness then asserts `together` and `apart` and logs every other expectation as pending
   * instead of failing the case. It is not a `knownGap`: a gap says the expectation is wrong, pending
   * says the expectation is right and the question cannot be put yet.
   */
  pending?: string
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

const num = (value: unknown, where: string): number =>
  typeof value === 'number' ? value : fail(where, `expected a number, got ${JSON.stringify(value)}`)

const uriGroups = (value: unknown, where: string): string[][] =>
  array(value, where).map((group, index) =>
    array(group, `${where}[${index}]`).map((uri, member) => str(uri, `${where}[${index}][${member}]`)))

const strings = (value: unknown, where: string): string[] =>
  array(value, where).map((entry, index) => str(entry, `${where}[${index}]`))

const only = (entry: Record<string, unknown>, keys: string[], where: string) => {
  for (const key of Object.keys(entry)) if (!keys.includes(key)) fail(where, `unknown key ${key}`)
}

const partOfs = (value: unknown, where: string): CorpusPartOf[] =>
  array(value, where).map((entry, index) => {
    const at = `${where}[${index}]`
    if (!isRecord(entry)) return fail(at, 'expected an object')
    only(entry, ['part', 'whole'], at)
    return { part: str(entry.part, `${at}.part`), whole: str(entry.whole, `${at}.whole`) }
  })

/** Reads a range and refuses the two ways it can be self-contradictory before anything runs against it. */
const episodeRange = (value: unknown, where: string): CorpusEpisodeRange => {
  if (!isRecord(value)) return fail(where, 'expected an object')
  only(value, ['fromStart', 'fromEnd', 'toStart', 'toEnd'], where)
  const parsed: CorpusEpisodeRange = {
    fromStart: num(value.fromStart, `${where}.fromStart`),
    fromEnd: num(value.fromEnd, `${where}.fromEnd`),
    toStart: num(value.toStart, `${where}.toStart`),
    toEnd: num(value.toEnd, `${where}.toEnd`),
  }
  if (parsed.fromEnd < parsed.fromStart) fail(where, `fromEnd ${parsed.fromEnd} is before fromStart ${parsed.fromStart}`)
  if (parsed.toEnd < parsed.toStart) fail(where, `toEnd ${parsed.toEnd} is before toStart ${parsed.toStart}`)
  const fromLength = parsed.fromEnd - parsed.fromStart + 1
  const toLength = parsed.toEnd - parsed.toStart + 1
  if (fromLength !== toLength) {
    fail(where, `${parsed.fromStart}..${parsed.fromEnd} is ${fromLength} episodes and ${parsed.toStart}..${parsed.toEnd} is ${toLength}, so the two sides cannot correspond`)
  }
  return parsed
}

const includeEdges = (value: unknown, where: string): CorpusIncludes[] =>
  array(value, where).map((entry, index) => {
    const at = `${where}[${index}]`
    if (!isRecord(entry)) return fail(at, 'expected an object')
    only(entry, ['container', 'run', 'range'], at)
    return {
      container: str(entry.container, `${at}.container`),
      run: str(entry.run, `${at}.run`),
      range: entry.range === undefined ? undefined : episodeRange(entry.range, `${at}.range`),
    }
  })

const episodePairs = (value: unknown, where: string): CorpusEpisodePair[] =>
  array(value, where).map((entry, index) => {
    const at = `${where}[${index}]`
    if (!isRecord(entry)) return fail(at, 'expected an object')
    only(entry, ['a', 'b'], at)
    return { a: str(entry.a, `${at}.a`), b: str(entry.b, `${at}.b`) }
  })

/** The expectations that are a person's label rather than an extraction, so each one needs a stamp. */
const CHECKED_EXPECTATIONS = ['partOf', 'includes', 'episodePairs', 'episodeApart', 'unrelated'] as const

const checkedStamp = (value: unknown, where: string): CorpusChecked => {
  if (!isRecord(value)) return fail(where, 'expected an object')
  only(value, ['by', 'at', 'notes'], where)
  const at = str(value.at, `${where}.at`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) fail(`${where}.at`, `expected YYYY-MM-DD, got ${JSON.stringify(at)}`)
  return {
    by: str(value.by, `${where}.by`),
    at,
    notes: value.notes === undefined ? undefined : str(value.notes, `${where}.notes`),
  }
}

/**
 * Reads one parsed case file, or throws naming the exact path that is wrong.
 *
 * Unknown keys are rejected rather than ignored: a typo in an expectation key is a case that asserts
 * nothing, which is the one failure this whole corpus exists to make impossible.
 */
export const validateCase = (value: unknown, where: string): CorpusCase => {
  if (!isRecord(value)) return fail(where, 'expected an object')
  const known = new Set(['name', 'source', 'why', 'rows', 'claims', 'episodes', 'expect', 'checked', 'pending'])
  for (const key of Object.keys(value)) if (!known.has(key)) fail(where, `unknown key ${key}`)

  const source = isRecord(value.source) ? value.source : fail(`${where}.source`, 'expected an object')
  only(source, ['file', 'test', 'answers'], `${where}.source`)
  const expectation = isRecord(value.expect) ? value.expect : fail(`${where}.expect`, 'expected an object')
  const knownExpect = new Set(['together', 'apart', 'episodeRows', 'knownGap', ...CHECKED_EXPECTATIONS])
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
      // deliberately unvalidated: it is the source's own answer, and reshaping it here would defeat
      // the reason it is kept
      raw: row.raw,
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
    source: {
      file: str(source.file, `${where}.source.file`),
      test: str(source.test, `${where}.source.test`),
      answers: source.answers === undefined ? undefined : strings(source.answers, `${where}.source.answers`),
    },
    why: str(value.why, `${where}.why`),
    rows,
    claims,
    episodes,
    expect: {
      together: uriGroups(expectation.together, `${where}.expect.together`),
      apart: uriGroups(expectation.apart, `${where}.expect.apart`),
      episodeRows,
      partOf: expectation.partOf === undefined ? undefined : partOfs(expectation.partOf, `${where}.expect.partOf`),
      includes: expectation.includes === undefined ? undefined : includeEdges(expectation.includes, `${where}.expect.includes`),
      episodePairs: expectation.episodePairs === undefined ? undefined : episodePairs(expectation.episodePairs, `${where}.expect.episodePairs`),
      episodeApart: expectation.episodeApart === undefined ? undefined : episodePairs(expectation.episodeApart, `${where}.expect.episodeApart`),
      unrelated: expectation.unrelated === undefined ? undefined : strings(expectation.unrelated, `${where}.expect.unrelated`),
      knownGap: expectation.knownGap === undefined ? undefined : str(expectation.knownGap, `${where}.expect.knownGap`),
    },
    checked: value.checked === undefined ? undefined : checkedStamp(value.checked, `${where}.checked`),
    pending: value.pending === undefined ? undefined : str(value.pending, `${where}.pending`),
  }

  // An expectation nobody decided is a guess with a file name, so the stamp is what makes the new
  // kinds admissible at all. The original 32 need none: their provenance is the suite in `source`.
  const stamped = CHECKED_EXPECTATIONS.filter(key => expectation[key] !== undefined)
  if (stamped.length && !parsed.checked) {
    fail(where, `expect.${stamped[0]} needs a checked stamp: an unchecked assertion is not a label`)
  }

  const described = new Set(parsed.rows.map(row => row.uri))
  const named = [
    ...parsed.expect.together.flat(),
    ...parsed.expect.apart.flat(),
    ...(parsed.expect.episodeRows ? [parsed.expect.episodeRows.clusterOf] : []),
    ...(parsed.expect.partOf ?? []).flatMap(relation => [relation.part, relation.whole]),
    ...(parsed.expect.includes ?? []).flatMap(edge => [edge.container, edge.run]),
    ...(parsed.expect.unrelated ?? []),
  ]
  for (const uri of named) if (!described.has(uri)) fail(where, `expects something of ${uri}, which no row describes`)
  for (const episode of parsed.episodes ?? []) {
    if (!described.has(episode.mediaUri)) fail(where, `episode ${episode.uri} hangs off ${episode.mediaUri}, which no row describes`)
  }

  const describedEpisodes = new Set((parsed.episodes ?? []).map(episode => episode.uri))
  for (const pair of [...parsed.expect.episodePairs ?? [], ...parsed.expect.episodeApart ?? []]) {
    for (const uri of [pair.a, pair.b]) {
      if (!describedEpisodes.has(uri)) fail(where, `expects something of episode ${uri}, which no episode row describes`)
    }
  }

  if (!parsed.expect.together.length && !parsed.expect.apart.length) fail(where, 'asserts neither together nor apart')

  return parsed
}
