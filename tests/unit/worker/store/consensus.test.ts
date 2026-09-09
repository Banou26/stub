import { describe, expect, test } from 'vitest'

import type { Episode, Media } from '../../../../src/worker/store/types'
import { runEpisodes, runLength, weightedConsensus } from '../../../../src/worker/store/consensus'

// The scores are the real ones, read off the extractors: mal 0.9, anilist 0.8, cr 0.5, kitsu 0.3, and
// anizip's MEDIA row carries none at all (it stamps 0.9 on titles, covers and episodes and passes no
// score to makeMedia). That last one is why a rule reading only the top score gets this wrong: the
// source with the most exact counts is ordered last for this field.
const media = (uri: string, score: number | null, episodeCount: number | null): Media =>
  ({ uri, origin: uri.slice(0, uri.indexOf(':')), score, episodeCount } as unknown as Media)

const episode = (mediaUri: string, episodeNumber: number): Episode =>
  ({ uri: `${mediaUri}-e${episodeNumber}`, mediaUri, episodeNumber } as unknown as Episode)

const listOf = (mediaUri: string, count: number) =>
  Array.from({ length: count }, (_, index) => episode(mediaUri, index + 1))

describe('weightedConsensus', () => {
  test('agreement outweighs a single better-scored source', () => {
    expect(weightedConsensus([
      { value: 24, score: 0.9 },
      { value: 11, score: 0.8 },
      { value: 11, score: 0.3 },
    ])).toBe(11)
  })

  test('and a lone authority still wins against one lightweight', () => {
    expect(weightedConsensus([{ value: 24, score: 0.9 }, { value: 11, score: 0.3 }])).toBe(24)
  })

  /**
   * The property the owner's sketch would have broken. They wrote `11 * 2 * 0.8 > 24 * 1 * 0.6`,
   * multiplying by the claim, which makes the larger number win for being larger: 24 * 0.6 is 14.4
   * against 11 * 0.8 at 8.8, so a lone source claiming a folded season would beat a lone catalogue
   * every time. The claim is what is being voted ON, so it is never part of its own weight.
   */
  test('a bigger number gets no advantage from being bigger', () => {
    expect(weightedConsensus([{ value: 24, score: 0.6 }, { value: 11, score: 0.8 }])).toBe(11)
    expect(weightedConsensus([{ value: 240, score: 0.6 }, { value: 11, score: 0.8 }])).toBe(11)
  })

  /**
   * 0.4 + 0.4 against 0.8: the same total, and the single 0.8 is the better witness.
   *
   * BOTH ORDERS, because the tie-break is only observable in one of them. The winner is tracked as an
   * incumbent, so whichever value is seen first holds the tie by default and a test written only that
   * way passes with no tie-break at all. Mutation caught exactly that.
   */
  test('an equal total is broken by the best single source behind it', () => {
    expect(weightedConsensus([
      { value: 24, score: 0.4 },
      { value: 24, score: 0.4 },
      { value: 11, score: 0.8 },
    ])).toBe(11)
    expect(weightedConsensus([
      { value: 11, score: 0.8 },
      { value: 24, score: 0.4 },
      { value: 24, score: 0.4 },
    ])).toBe(11)
  })

  test('a source that says nothing is not a vote for anything', () => {
    expect(weightedConsensus([{ value: null, score: 0.9 }, { value: 11, score: 0.3 }])).toBe(11)
    expect(weightedConsensus([{ value: undefined, score: 0.9 }])).toBeUndefined()
    expect(weightedConsensus([])).toBeUndefined()
  })

  // anizip publishes no media score, so a rule that ignored unscored rows would be blind to the source
  // with the most exact counts. It adds nothing to a TOTAL, having no score, so what it can decide is
  // the value when it is the only claimant (below) and the witness count in runEpisodes.
  test('an unscored source is still a claim', () => {
    expect(runLength([media('anizip:1', null, 11)])).toBe(11)
    expect(runLength([media('anizip:1', null, 11), media('mal:1', 0.9, 11)])).toBe(11)
  })
})

describe('runEpisodes', () => {
  // Mushoku Tensei season 1 part 1 as the cluster really stands: four catalogues at 11 and
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

  test('a member that agrees about the length keeps every episode it has', () => {
    const listed = runEpisodes(MUSHOKU_S1P1, listOf('kitsu:42323', 11))
    expect(listed).toHaveLength(11)
  })

  /**
   * THE SAFETY BAR, and the reason it is not simply "drop what exceeds the count".
   *
   * Twelve sources in this tree set `episodeCount = episodes.length`, so a catalogue that could only
   * reach part of a run publishes a SHORT count as confidently as one that knows the whole run. A
   * consensus resting on ONE such source would trim episodes that really aired, so a single witness
   * never trims anything however well it scores.
   */
  test('one source alone never trims another, however well it scores', () => {
    // 0.9 against 0.3 clears the twice-the-weight bar comfortably, so the witness bar is the only
    // thing refusing here, which is what makes this a test of it
    const cluster = [media('mal:1', 0.9, 6), media('kitsu:1', 0.3, 12)]
    expect(runLength(cluster)).toBe(6)
    expect(runEpisodes(cluster, listOf('kitsu:1', 12))).toHaveLength(12)
  })

  // and two lightweights do not outvote one middling source in the first place, so the longer list is
  // simply the consensus and nothing is trimmed. This is the vote itself protecting the same case.
  test('two lightweights do not outvote the source they would trim', () => {
    const cluster = [media('tvdb:1', 0.1, 6), media('trakt:1', 0.1, 6), media('cr:1', 0.5, 12)]
    expect(runLength(cluster)).toBe(12)
    expect(runEpisodes(cluster, listOf('cr:1', 12))).toHaveLength(12)
  })

  /**
   * A RELEASING SHOW, which is where a count vote is most dangerous and where the margin bar earns
   * its keep.
   *
   * Mushoku Tensei season 3 while airing: mal and AniList publish the ANNOUNCED 14, and six sources
   * publish `episodes.length`, the eleven that have aired. The vote goes to 11 by 1.8 against 1.7,
   * because six derived lengths outweigh two declared counts, and a rule that acted on that would
   * hide three episodes as they aired. 1.8 is nowhere near twice 1.7, so nothing is trimmed.
   *
   * This is the same shape that made the same vote unsafe for the PUBLISHED count, which is why that
   * half was measured and pulled. See aggregate-fields.test.ts.
   */
  test('a releasing show is not trimmed to what has aired so far', () => {
    const airing = [
      media('mal:59193', 0.9, 14), media('anilist:178789', 0.8, 14),
      media('cr:1', 0.5, 11), media('kitsu:49002', 0.3, 11), media('tmdb:1', 0.3, 11),
      media('tvmaze:1', 0.3, 11), media('jw:1', 0.2, 11), media('nf:1', 0.2, 11),
    ]
    expect(runLength(airing), 'the vote itself does go to the aired-so-far count').toBe(11)
    expect(runEpisodes(airing, listOf('mal:59193', 14)), 'but nothing is hidden on a 1.8 to 1.7 margin')
      .toHaveLength(14)
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
   * `undefined <= 11` is false, which is the case that needs the guard.
   */
  test('an unnumbered episode is never trimmed', () => {
    const listed = runEpisodes(MUSHOKU_S1P1, [
      ...listOf('cr:G24H1N3MP-G609CX3J4', 24),
      { uri: 'cr:special', mediaUri: 'cr:G24H1N3MP-G609CX3J4' } as unknown as Episode,
    ])
    expect(listed.some(e => e.uri === 'cr:special')).toBe(true)
  })

  /**
   * An unscored member is a WITNESS but not a WEIGHT, which is anizip's exact position: it stamps 0.9
   * on its titles and episodes and passes no score to its media row, so it counts toward the two
   * witnesses and contributes nothing to the twice-the-weight bar.
   *
   * So `anizip + mal` against Crunchyroll is 0.9 against 0.5, under twice, and nothing is trimmed;
   * add AniList and it is 1.7 against 0.5 and the fold goes. Both are the rule working: the first is
   * a disagreement between two sources, the second is four sources against one.
   */
  test('an unscored member is a witness but adds no weight', () => {
    const thin = [media('anizip:1', null, 11), media('mal:1', 0.9, 11), media('cr:1', 0.5, 24)]
    expect(runEpisodes(thin, listOf('cr:1', 24))).toHaveLength(24)

    const backed = [...thin, media('anilist:1', 0.8, 11)]
    expect(runEpisodes(backed, listOf('cr:1', 24))).toHaveLength(11)
  })
})
