import { describe, expect, test } from 'vitest'

import type { Episode, Media } from '../../../../src/worker/store/types'
import { runEpisodes, runLength, tieredConsensus } from '../../../../src/worker/store/consensus'

// The scores are the real ones, read off the extractors: mal 0.9, anilist 0.8, cr 0.5, kitsu/tmdb/
// tvmaze 0.3, jw/nf/appletv/paramount 0.2, and anizip's MEDIA row carries none at all (it stamps 0.9
// on titles, covers and episodes and passes no score to makeMedia).
const media = (uri: string, score: number | null, episodeCount: number | null): Media =>
  ({ uri, origin: uri.slice(0, uri.indexOf(':')), score, episodeCount } as unknown as Media)

const episode = (mediaUri: string, episodeNumber: number): Episode =>
  ({ uri: `${mediaUri}-e${episodeNumber}`, mediaUri, episodeNumber } as unknown as Episode)

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
      { uri: 'cr:special', mediaUri: 'cr:G24H1N3MP-G609CX3J4' } as unknown as Episode,
    ])
    expect(listed.some(e => e.uri === 'cr:special')).toBe(true)
  })
})
