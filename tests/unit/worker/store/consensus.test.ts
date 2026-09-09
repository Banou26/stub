import { describe, expect, test } from 'vitest'

import type { Episode, Media } from '../../../../src/worker/store/types'
import { alignRunEpisodes, alignmentOffset, runEpisodes, runLength, tieredConsensus } from '../../../../src/worker/store/consensus'

// The scores are the real ones, read off the extractors: mal 0.9, anilist 0.8, cr 0.5, kitsu/tmdb/
// tvmaze 0.3, jw/nf/appletv/paramount 0.2, and anizip's MEDIA row carries none at all (it stamps 0.9
// on titles, covers and episodes and passes no score to makeMedia).
const media = (uri: string, score: number | null, episodeCount: number | null): Media =>
  ({ uri, origin: uri.slice(0, uri.indexOf(':')), score, episodeCount } as unknown as Media)

// origin, because that is what the alignment groups by: a source can hang its episodes off another
// source's row, so the row an episode points at does not say who numbered it
const episode = (mediaUri: string, episodeNumber: number): Episode =>
  ({
    uri: `${mediaUri}-e${episodeNumber}`,
    origin: mediaUri.slice(0, mediaUri.indexOf(':')),
    mediaUri,
    episodeNumber,
  } as unknown as Episode)

const listOf = (mediaUri: string, count: number) =>
  Array.from({ length: count }, (_, index) => episode(mediaUri, index + 1))

const valueOf = (claims: { value: number | null, score: number | null }[]) => tieredConsensus(claims)?.value

describe('tieredConsensus', () => {
  /**
   * THE DECISION THIS FILE EXISTS TO PIN, and it is the opposite of what a weighted sum does.
   *
   * A better source is never outvoted by worse ones, however many there are. Five streaming catalogues
   * restating one packaging is one witness counted five times, and summing their scores hands them the
   * answer: 24 scored 1.3 against 11's 1.2 on the real Mushoku Tensei cluster.
   */
  test('one good source beats any number of worse ones', () => {
    expect(valueOf([
      { value: 11, score: 0.9 },
      { value: 24, score: 0.5 }, { value: 24, score: 0.2 }, { value: 24, score: 0.2 },
      { value: 24, score: 0.2 }, { value: 24, score: 0.2 },
    ])).toBe(11)
  })

  // and agreement still decides among EQUALS, which is the whole reason this is not just "take the
  // top-scored row and stop"
  test('and agreement decides among equals', () => {
    expect(valueOf([
      { value: 24, score: 0.9 },
      { value: 11, score: 0.9 }, { value: 11, score: 0.9 },
    ])).toBe(11)
  })

  test('a tier below the best one is never consulted at all', () => {
    // twenty rows at 0.3 saying 22 cannot move a single 0.8 row saying 12
    const crowd = Array.from({ length: 20 }, () => ({ value: 22, score: 0.3 }))
    expect(valueOf([{ value: 12, score: 0.8 }, ...crowd])).toBe(12)
  })

  /**
   * The owner's first sketch was `11 * 2 * 0.8 > 24 * 1 * 0.6`, multiplying by the claim. That makes
   * the larger number win for being larger, so a lone folded season beats a lone catalogue every time.
   * The claim is what is being voted ON, so it is never part of its own weight.
   */
  test('a bigger number gets no advantage from being bigger', () => {
    expect(valueOf([{ value: 240, score: 0.6 }, { value: 11, score: 0.8 }])).toBe(11)
  })

  test('a source that says nothing is not a claim, and no claims is no answer', () => {
    expect(valueOf([{ value: null, score: 0.9 }, { value: 11, score: 0.3 }])).toBe(11)
    expect(tieredConsensus([{ value: null, score: 0.9 }])).toBeUndefined()
    expect(tieredConsensus([])).toBeUndefined()
  })

  // anizip's media row is unscored, so it forms the bottom tier on its own and decides only when
  // nobody else has said anything
  test('an unscored source is a claim, at the bottom', () => {
    expect(runLength([media('anizip:1', null, 11)])).toBe(11)
    expect(runLength([media('anizip:1', null, 12), media('mal:1', 0.9, 11)])).toBe(11)
  })

  // deterministic on a tie inside one tier, and it goes to the LARGER value: everything downstream
  // only ever refuses something for being too long, so over-estimating costs a refusal and
  // under-estimating hides data
  test('a tie inside one tier goes to the larger value, both orders', () => {
    expect(valueOf([{ value: 11, score: 0.9 }, { value: 13, score: 0.9 }])).toBe(13)
    expect(valueOf([{ value: 13, score: 0.9 }, { value: 11, score: 0.9 }])).toBe(13)
  })
})

describe('runEpisodes', () => {
  // Mushoku Tensei season 1 part 1 as the cluster really stands: the catalogues at 11 and
  // Crunchyroll's season 1, which is that run plus part 2 plus the Eris special.
  const MUSHOKU_S1P1 = [
    media('anizip:14758', null, 11),
    media('mal:39535', 0.9, 11),
    media('anilist:108465', 0.8, 11),
    media('kitsu:42323', 0.3, 11),
    media('cr:G24H1N3MP-G609CX3J4', 0.5, 24),
  ]

  test("the fold's tail is dropped and its own eleven are kept", () => {
    const listed = runEpisodes(MUSHOKU_S1P1, [...listOf('anizip:14758', 11), ...listOf('cr:G24H1N3MP-G609CX3J4', 24)])
    expect(new Set(listed.map(e => e.episodeNumber)).size).toBe(11)
    // Crunchyroll is not thrown out, it is trimmed: its first eleven are this run's episodes
    expect(listed.filter(e => e.mediaUri.startsWith('cr:'))).toHaveLength(11)
  })

  /**
   * THE ECHO TIER, which a sum of scores got wrong and tiers get right.
   *
   * Once JustWatch, Netflix, Apple TV and Paramount restate Crunchyroll's packaging, the folded 24 is
   * claimed by five sources totalling 1.3 against 11's 1.2. They are one witness counted five times,
   * and not one of them outranks MAL, so the fold is still trimmed.
   */
  test('a folded season stays trimmed however many catalogues echo it', () => {
    const echoed = [
      ...MUSHOKU_S1P1,
      media('jw:1', 0.2, 24), media('nf:1', 0.2, 24),
      media('appletv:1', 0.2, 24), media('paramount:1', 0.2, 24),
    ]
    expect(runLength(echoed)).toBe(11)
    expect(runEpisodes(echoed, listOf('cr:G24H1N3MP-G609CX3J4', 24))).toHaveLength(11)
  })

  test('a member that agrees about the length keeps every episode it has', () => {
    expect(runEpisodes(MUSHOKU_S1P1, listOf('kitsu:42323', 11))).toHaveLength(11)
  })

  /**
   * A RELEASING SHOW, where a count rule is most dangerous.
   *
   * Mushoku Tensei season 3 while airing: MAL and AniList publish the ANNOUNCED 14, and six sources
   * publish `episodes.length`, the eleven that have aired. A sum goes to 11 by 1.8 against 1.7 and
   * would hide three episodes as they air. Tiers read MAL's 14 and never look at the tier below.
   */
  test('a releasing show is not trimmed to what has aired so far', () => {
    const airing = [
      media('mal:59193', 0.9, 14), media('anilist:178789', 0.8, 14),
      media('cr:1', 0.5, 11), media('kitsu:49002', 0.3, 11), media('tmdb:1', 0.3, 11),
      media('tvmaze:1', 0.3, 11), media('jw:1', 0.2, 11), media('nf:1', 0.2, 11),
    ]
    expect(runLength(airing)).toBe(14)
    expect(runEpisodes(airing, listOf('mal:59193', 14))).toHaveLength(14)
  })

  /**
   * THE WITNESS BAR. Twelve sources set `episodeCount = episodes.length`, so a catalogue that reached
   * only part of a run publishes a SHORT count as confidently as one that knows the whole run. A
   * length resting on one row never trims anything, however well that row scores.
   */
  test('one source alone never trims another, however well it scores', () => {
    const cluster = [media('mal:1', 0.9, 6), media('kitsu:1', 0.3, 12)]
    expect(runLength(cluster)).toBe(6)
    expect(runEpisodes(cluster, listOf('kitsu:1', 12))).toHaveLength(12)
  })

  /**
   * AND AN EQUAL IS NEVER TRIMMED. Two sources in one tier disagreeing is a disagreement, and the
   * answer to that is to show the tier's majority, not to delete the dissenter's episodes.
   */
  test('a source in the deciding tier keeps its episodes even when outvoted', () => {
    // three sources in one tier, two of them saying 12: the third is OUTVOTED on the number and still
    // untouched on its episodes, because it is nobody's inferior
    const cluster = [media('mal:1', 0.9, 12), media('anizip:1', 0.9, 12), media('other:1', 0.9, 13)]
    expect(runLength(cluster)).toBe(12)
    expect(runEpisodes(cluster, listOf('other:1', 13))).toHaveLength(13)
  })

  // and one tier down it IS trimmed, or the rule above would just be "never trim"
  test('but a source below the deciding tier is', () => {
    const cluster = [media('mal:1', 0.9, 12), media('anizip:1', 0.9, 12), media('kitsu:1', 0.3, 22)]
    expect(runEpisodes(cluster, listOf('kitsu:1', 22))).toHaveLength(12)
  })

  test('a cluster where nobody publishes a count is left alone', () => {
    const cluster = [media('anizip:1', null, null), media('cr:1', 0.5, null)]
    expect(runEpisodes(cluster, listOf('cr:1', 24))).toHaveLength(24)
  })

  /**
   * An episode with no number cannot be over the length, and dropping it would lose a special.
   *
   * `undefined` rather than `null` on purpose: `null <= 11` is TRUE in JavaScript, so a null-numbered
   * episode survives whether or not the guard exists and a test written with one asserts nothing.
   */
  test('an unnumbered episode is never trimmed', () => {
    const listed = runEpisodes(MUSHOKU_S1P1, [
      ...listOf('cr:G24H1N3MP-G609CX3J4', 24),
      { uri: 'cr:special', origin: 'cr', mediaUri: 'cr:G24H1N3MP-G609CX3J4' } as unknown as Episode,
    ])
    expect(listed.some(e => e.uri === 'cr:special')).toBe(true)
  })
})

/**
 * THE ELUSIVE SAMURAI SEASON 2, read out of dist-seed/snapshots.jsonl on 2026-09-09.
 *
 * anizip, kitsu, MAL and AniList publish this run as episodes 1 to 12. Crunchyroll publishes the same
 * broadcast as 13 to 20, continuing its own count from season 1, with THE SAME AIR DATES to the day.
 * It is not a fold, so nothing refused it and nothing trimmed it: 8 is fewer than 12, so `foldVetoed`
 * never fired and `runEpisodes` only ever trims a count strictly greater than the run's.
 *
 * `mergeByEpisodeNumber` keys on the number alone, so the page drew TWENTY rows for a twelve episode
 * run, with every Crunchyroll source on rows 13 to 20 where nothing else was.
 */
const dated = (mediaUri: string, from: number, days: string[]): Episode[] =>
  days.map((day, index) => ({
    uri: `${mediaUri}-e${from + index}`,
    origin: mediaUri.slice(0, mediaUri.indexOf(':')),
    mediaUri,
    episodeNumber: from + index,
    releaseDate: `${day}T00:00:00.000Z`,
  } as unknown as Episode))

// twelve weekly slots from the real premiere; crunchyroll had aired the first EIGHT when the seed was
// taken, which is why its list is shorter than the run and still numbered 13 to 20
const WEEKLY = [
  '2026-07-17', '2026-07-24', '2026-07-31', '2026-08-07', '2026-08-14', '2026-08-21',
  '2026-08-28', '2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02',
]
const AIRED = WEEKLY.slice(0, 8)

describe('alignmentOffset', () => {
  test('a source counting on from a previous season is read off the dates it shares', () => {
    expect(alignmentOffset(dated('anizip:18903', 1, WEEKLY), dated('cr:GQWH0M19X-GS00366034', 13, AIRED))).toBe(12)
  })

  test('and a source already counting the same way needs no offset', () => {
    expect(alignmentOffset(dated('anizip:1', 1, WEEKLY), dated('cr:1', 1, WEEKLY))).toBe(0)
  })

  /**
   * Nothing rather than a guess. Hana-Kimi season 2 has episodes 1 and 2 both dated 2026-07-01, and
   * Mushoku Tensei season 3 aired its first two on one day: a day the run uses twice cannot say which
   * episode a date belongs to.
   */
  test('a day the run uses twice is no anchor at all', () => {
    const twice = dated('anizip:1', 1, ['2026-07-01', '2026-07-01'])
    expect(alignmentOffset(twice, dated('cr:1', 5, ['2026-07-01', '2026-07-01']))).toBeUndefined()
  })

  /**
   * And a doubled day must not out-vote the real alignment, which is what makes the refusal worth
   * having rather than merely tidy. Here two doubled days would agree on an offset of 2 while the one
   * unambiguous day says 10: reading them gives a confident wrong answer, refusing them gives none.
   */
  test('a doubled day cannot out-vote the one unambiguous day', () => {
    const ambiguous = [
      { uri: 'a-9', origin: 'a', mediaUri: 'a', episodeNumber: 9, releaseDate: '2026-07-01T00:00:00.000Z' },
      { uri: 'a-1', origin: 'a', mediaUri: 'a', episodeNumber: 1, releaseDate: '2026-07-01T00:00:00.000Z' },
      { uri: 'a-9b', origin: 'a', mediaUri: 'a', episodeNumber: 9, releaseDate: '2026-07-08T00:00:00.000Z' },
      { uri: 'a-2', origin: 'a', mediaUri: 'a', episodeNumber: 2, releaseDate: '2026-07-08T00:00:00.000Z' },
      { uri: 'a-3', origin: 'a', mediaUri: 'a', episodeNumber: 3, releaseDate: '2026-07-15T00:00:00.000Z' },
    ] as unknown as Episode[]
    const theirs = [
      { uri: 'b-11', origin: 'b', mediaUri: 'b', episodeNumber: 11, releaseDate: '2026-07-01T00:00:00.000Z' },
      { uri: 'b-11b', origin: 'b', mediaUri: 'b', episodeNumber: 11, releaseDate: '2026-07-08T00:00:00.000Z' },
      { uri: 'b-13', origin: 'b', mediaUri: 'b', episodeNumber: 13, releaseDate: '2026-07-15T00:00:00.000Z' },
    ] as unknown as Episode[]
    expect(alignmentOffset(ambiguous, theirs)).toBeUndefined()
  })

  // two offsets with equal support are two readings of one set of dates, and picking either is a guess
  test('two offsets explaining the same evidence is a refusal', () => {
    const reference = dated('a', 1, ['2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22'])
    const split = [
      ...dated('b', 5, ['2026-07-01', '2026-07-08']),
      ...dated('b', 9, ['2026-07-15', '2026-07-22']),
    ]
    expect(alignmentOffset(reference, split), 'offset 4 twice and offset 6 twice').toBeUndefined()
  })

  test('and one shared date alone is a coincidence, not an alignment', () => {
    expect(alignmentOffset(dated('anizip:1', 1, WEEKLY), dated('cr:1', 13, ['2026-07-17']))).toBeUndefined()
  })

  test('no dates on either side is no answer', () => {
    const undated = [{ uri: 'cr:1-e1', origin: 'cr', mediaUri: 'cr:1', episodeNumber: 13 } as unknown as Episode]
    expect(alignmentOffset(dated('anizip:1', 1, WEEKLY), undated)).toBeUndefined()
    expect(alignmentOffset(undated, dated('cr:1', 1, WEEKLY))).toBeUndefined()
  })
})

describe('alignRunEpisodes', () => {
  const CLUSTER = [
    media('anizip:18903', null, 12), media('mal:60059', 0.9, 12), media('anilist:182616', 0.8, 12),
    media('kitsu:49265', 0.3, 12), media('cr:GQWH0M19X-GS00366034', 0.5, 8),
  ]
  const EPISODES = [...dated('anizip:18903', 1, WEEKLY), ...dated('cr:GQWH0M19X-GS00366034', 13, AIRED)]

  test("crunchyroll's 13 to 20 become the run's 1 to 8", () => {
    const aligned = alignRunEpisodes(CLUSTER, EPISODES)
    const numbers = EPISODES
      .filter(e => e.mediaUri.startsWith('cr:'))
      .map(e => aligned.get(e.uri)?.episodeNumber ?? e.episodeNumber)
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  test('and the run drops from twenty distinct rows to twelve', () => {
    const aligned = alignRunEpisodes(CLUSTER, EPISODES)
    const drawn = new Set(EPISODES.map(e => (aligned.get(e.uri) ?? e).episodeNumber))
    expect(new Set(EPISODES.map(e => e.episodeNumber)).size, 'what it drew before').toBe(20)
    expect(drawn.size).toBe(12)
  })

  // the reference is never rewritten: it is the numbering everything else is aligned ONTO
  test('the sources that agree about the length are left alone', () => {
    const aligned = alignRunEpisodes(CLUSTER, EPISODES)
    expect(EPISODES.filter(e => e.mediaUri.startsWith('anizip:')).some(e => aligned.has(e.uri))).toBe(false)
  })

  // and the stored node keeps crunchyroll's own number: what the run gets is a copy
  test('the stored episode is not rewritten', () => {
    const before = EPISODES.find(e => e.mediaUri.startsWith('cr:'))!.episodeNumber
    alignRunEpisodes(CLUSTER, EPISODES)
    expect(EPISODES.find(e => e.mediaUri.startsWith('cr:'))!.episodeNumber).toBe(before)
  })
})

/**
 * THE WHOLE JOURNEY AT THE STORE LAYER: a season that CONTAINS this run lends it every episode it
 * has, and the run keeps only its own.
 *
 * Mushoku Tensei season 2 part 2. Crunchyroll models one season of 24 across a nine month gap, so
 * neither part matches it and part 2 never came near it at all. The season now hands its episodes to
 * whichever run asked, keeping Crunchyroll's own numbering, and the run works out the rest: the dates
 * put CR 13 on the run's 1, which makes CR 1 to 12 land at zero and below, and the window drops them.
 *
 * The lower bound is the half a ceiling cannot do. Without it the page would draw rows numbered 0,
 * -1, -2, which is a stranger failure than the one this started as.
 */
describe('a containing season lent to a run', () => {
  const PART2 = [
    media('anizip:18104', null, 12), media('mal:55888', 0.9, 12),
    media('anilist:166873', 0.8, 12), media('kitsu:47694', 0.3, 12),
  ]
  const CR_SEASON = ['2023-07-09', '2023-07-16', '2023-07-23', '2023-07-30', '2023-08-06', '2023-08-13',
    '2023-08-20', '2023-08-27', '2023-09-03', '2023-09-10', '2023-09-17', '2023-09-24']
  const CR_PART2 = ['2024-04-07', '2024-04-14', '2024-04-21', '2024-04-28', '2024-05-05', '2024-05-12',
    '2024-05-19', '2024-05-26', '2024-06-02', '2024-06-09', '2024-06-16', '2024-06-23']

  // crunchyroll's episodes arrive attached to the RUN, with crunchyroll's own numbers 1..24
  const lent = [...dated('cr:GSP1', 1, CR_SEASON), ...dated('cr:GSP1', 13, CR_PART2)]
    .map(episode => ({ ...episode, origin: 'cr', mediaUri: 'anilist:166873' } as unknown as Episode))
  const OWN = dated('anizip:18104', 1, CR_PART2)
  const ALL = [...OWN, ...lent]

  test("crunchyroll's 13 to 24 become this run's 1 to 12", () => {
    const aligned = alignRunEpisodes(PART2, ALL)
    const cr = lent.map(e => (aligned.get(e.uri) ?? e).episodeNumber)
    expect(cr.slice(12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  test("and the previous cour's twelve are windowed away rather than drawn at zero and below", () => {
    const aligned = alignRunEpisodes(PART2, ALL)
    const kept = runEpisodes(PART2, ALL.map(e => aligned.get(e.uri) ?? e))
    const numbers = [...new Set(kept.map(e => e.episodeNumber))].sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(kept.filter(e => e.origin === 'cr'), 'and twelve crunchyroll sources survive').toHaveLength(12)
  })
})

/**
 * A LOAN IS ONLY ACCEPTED WHEN THE RUN CAN SAY WHICH EPISODES ARE ITS OWN.
 *
 * Mushoku Tensei season 2 part 1, read off the running app 2026-09-09: MAL publishes no count at all
 * and AniList says 13 for a run that aired 12, so the length rests on ONE witness. Windowing a lent
 * season to 13 put a thirteenth row on the page that only Crunchyroll had; declining the loan leaves
 * the page exactly as it was.
 *
 * The bar applies to the LOAN, not to the run: a member's own episodes are never hidden on a shaky
 * length, because that is how episodes that aired disappear.
 */
describe('an uncorroborated length', () => {
  const SHAKY = [
    media('anilist:146065', 0.8, 13), media('mal:51179', 0.9, null),
    media('kitsu:45950', 0.3, 12), media('anizip:17236', null, 12),
  ]
  const own = dated('anizip:17236', 1, ['2023-07-09', '2023-07-16', '2023-07-23'])
  const lent = dated('cr:GSP1', 1, ['2023-07-09', '2023-07-16', '2023-07-23'])
    .map(e => ({ ...e, origin: 'cr', mediaUri: 'anilist:146065' } as unknown as Episode))

  test('refuses a lent season rather than slicing on a length one source claims', () => {
    expect(runLength(SHAKY), 'the tier rule still answers').toBe(13)
    const kept = runEpisodes(SHAKY, [...own, ...lent])
    expect(kept.filter(e => e.origin === 'cr'), 'the loan is declined whole').toHaveLength(0)
  })

  test("and keeps the run's own episodes, which are never the thing in doubt", () => {
    expect(runEpisodes(SHAKY, [...own, ...lent]).filter(e => e.origin === 'anizip')).toHaveLength(3)
  })
})
