import type { Episode, Media } from './types'

/**
 * What the BEST SOURCES say, with agreement breaking ties only among equals.
 *
 * The store's other resolutions take the highest-scored source's value and stop (`acc.x ?? gql.x` over
 * a score-sorted list), so one source outvotes any number of others however many agree with each
 * other. That is right for a title, where sources are spelling the same thing differently and the
 * best-scored spelling is simply the one to show. It is not enough for a NUMBER, where sources are
 * making a claim about the world and two equals agreeing is evidence the first one alone is not.
 *
 * SO THE TIERS ARE LEXICOGRAPHIC, NEVER ADDITIVE. The best score present decides which claims are
 * looked at; among those, the value the most of them claim wins; nothing below that tier is consulted
 * at all. A source cannot be outvoted by any number of sources beneath it.
 *
 * A SUM WAS TRIED FIRST AND IS WRONG, measured three ways on 2026-09-09:
 *
 *   Mushoku Tensei S1 part 1, once the streaming tier echoes Crunchyroll's packaging:
 *     24 scores cr 0.5 + jw 0.2 + nf 0.2 + appletv 0.2 + paramount 0.2 = 1.3
 *     11 scores mal 0.9 + kitsu 0.3                                    = 1.2
 *   and the sum publishes the folded 24, which is the defect it was written to stop. Five catalogues
 *   restating one packaging is one witness counted five times.
 *
 *   Mushoku Tensei season 3 while airing: mal and AniList publish the announced 14, and six sources
 *   publish `episodes.length`, the eleven aired so far. The sum goes 1.8 to 1.7 for 11.
 *
 *   Over the 100 cluster snapshot in dist-seed the sum was identical to today's rule in 100 of 100,
 *   so it bought nothing anywhere and lost in exactly the cases that matter.
 *
 * Tiers answer 11 and 14, correctly, in both.
 *
 * NOT the value times anything, in either shape. The owner's first sketch was `11 * 2 * 0.8 >
 * 24 * 1 * 0.6`, multiplying by the claim: that makes the larger number win for being larger, so a
 * lone folded season beats a lone catalogue every time. The claim is what is being voted ON.
 */
export const tieredConsensus = <T>(
  claims: readonly { value: T | null | undefined, score?: number | null }[]
): { value: T, tier: number } | undefined => {
  const stated = claims.filter((claim): claim is { value: T, score?: number | null } => claim.value != null)
  if (!stated.length) return undefined

  // an unscored row is its own tier at the bottom, which is where anizip's media rows sit until
  // src/sources/anizip/extractor.ts passes a score to makeMedia
  const tier = Math.max(...stated.map(claim => claim.score ?? 0))
  const atTier = stated.filter(claim => (claim.score ?? 0) === tier)

  const support = new Map<T, number>()
  for (const claim of atTier) support.set(claim.value, (support.get(claim.value) ?? 0) + 1)

  let winner: T | undefined
  let best = 0
  for (const [value, count] of support) {
    // a tie inside one tier goes to the LARGER value: everything downstream of this only ever refuses
    // something for being too long, so over-estimating costs a refusal and under-estimating hides data
    const better = count > best || (count === best && winner != null && Number(value) > Number(winner))
    if (winner == null || better) { winner = value; best = count }
  }
  return winner == null ? undefined : { value: winner, tier }
}

/** How long the best-scored sources say this run is, or nothing when none of them says. */
export const runLength = (cluster: readonly Media[]): number | undefined =>
  tieredConsensus(cluster.map(media => ({ value: media.episodeCount, score: media.score })))?.value

/**
 * The episodes that belong to THIS run, dropping the tail a longer packaging of it brings.
 *
 * A cluster can be exactly right about who it contains and still list somebody else's episodes,
 * because an episode arrives attached to whichever media published it. Crunchyroll models Mushoku
 * Tensei season 1 as one season of 23 and a special where AniList and MAL split the same broadcast
 * into 11 and 12, so an 11 episode run listed 24 rows: 11 correct, then part 2's twelve, then the
 * special (measured on the live site 2026-09-09).
 *
 * The rule is the one `sources/similar.ts` already applies when CHOOSING a season, moved to where the
 * choice is displayed: a member whose own count exceeds what the run's sources agree on is describing
 * a longer thing, and only the part of its list that fits the run is this run's.
 *
 * IT REFUSES A TAIL, NEVER A SOURCE. Crunchyroll's episodes 1 to 11 are still this run's episodes and
 * are still listed; a member that agrees about the length is untouched however low its score; and a
 * cluster whose sources publish no count at all is left exactly as it was, because there is nothing to
 * be wrong about. That last case is the reason this cannot be written as "drop what exceeds the
 * count": most of the store has no count.
 */
/** A release date as a DAY, which is the precision two catalogues actually agree to. */
const dayOf = (episode: { releaseDate?: string | null }): number | undefined => {
  const at = episode.releaseDate ? Date.parse(episode.releaseDate) : Number.NaN
  return Number.isFinite(at) ? Math.floor(at / 86_400_000) : undefined
}

/**
 * How far another source's numbering sits from this run's, read off the DATES they share.
 *
 * A catalogue may number a season continuing from the previous one where everyone else restarts at 1.
 * The Elusive Samurai season 2, in the shipped seed: anizip, kitsu, MAL and AniList all publish
 * episodes 1 to 12, and Crunchyroll publishes the same broadcast as 13 to 20, with the SAME AIR DATES
 * to the day. `mergeByEpisodeNumber` keys on the number alone, so the page drew twenty rows for a
 * twelve episode run and put every Crunchyroll source on rows 13 to 20, where nothing else was.
 *
 * The dates are the anchor because they are the one thing both sides measure the same way. A date is
 * not compared to a start date, which is a claim that drifts (the highest-scored start date in this
 * store is three days off Crunchyroll's own episode 1 for at least one show in the seed): it is
 * compared to ANOTHER EPISODE'S date from the same broadcast, which either matches to the day or does
 * not.
 *
 * NOTHING RATHER THAN A GUESS, in every ambiguous case:
 *   - fewer than MIN_ALIGNED dates in common, so a coincidence could carry it
 *   - two offsets explaining the same evidence, which is what a season with two episodes on one day
 *     produces (Hana-Kimi season 2 has episodes 1 and 2 both dated 2026-07-01)
 *   - any date matching more than one reference episode, for the same reason
 */
const MIN_ALIGNED = 2

export const alignmentOffset = (
  reference: readonly Episode[],
  other: readonly Episode[]
): number | undefined => {
  // DISTINCT numbers per day, not rows per day. Several sources describing one run all say that this
  // day is episode 1, and three of them agreeing is the opposite of an ambiguity; what disqualifies a
  // day is the run using it for two DIFFERENT episodes.
  const runByDay = new Map<number, Set<number>>()
  for (const episode of reference) {
    const day = dayOf(episode)
    if (day == null || episode.episodeNumber == null) continue
    const numbers = runByDay.get(day) ?? new Set<number>()
    numbers.add(episode.episodeNumber)
    runByDay.set(day, numbers)
  }
  if (!runByDay.size) return undefined

  const votes = new Map<number, number>()
  for (const episode of other) {
    const day = dayOf(episode)
    if (day == null || episode.episodeNumber == null) continue
    const numbers = runByDay.get(day)
    // a day the run uses for two different episodes cannot say which one this is
    if (!numbers || numbers.size !== 1) continue
    const offset = episode.episodeNumber - [...numbers][0]!
    votes.set(offset, (votes.get(offset) ?? 0) + 1)
  }

  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1])
  const [best, support] = ranked[0] ?? []
  if (best == null || support == null || support < MIN_ALIGNED) return undefined
  // one offset has to explain it ALONE: a second offset with the same support is two readings of the
  // same evidence, and picking either is a guess
  if (ranked[1] && ranked[1][1] === support) return undefined
  return best
}

export const runEpisodes = <T extends Episode>(cluster: readonly Media[], episodes: readonly T[]): T[] => {
  const agreed = tieredConsensus(cluster.map(media => ({ value: media.episodeCount, score: media.score })))
  if (!agreed) return [...episodes]
  const { value: length, tier } = agreed

  /**
   * TWO WITNESSES before anything is hidden.
   *
   * Half the counts in this tree are not claims at all: twelve sources set `episodeCount =
   * episodes.length`, so a catalogue that could only reach part of a run publishes a SHORT count as
   * confidently as one that knows the whole run. A length resting on a single row, acted on, hides
   * episodes that aired. The second witness may come from any tier, since the question here is only
   * whether the number is corroborated at all.
   */
  const backing = cluster.filter(media => media.episodeCount === length)
  if (backing.length < 2) return [...episodes]

  /**
   * AND ONLY A STRICTLY LOWER TIER IS TRIMMED.
   *
   * A member that packages this run inside a longer season is describing a different thing, and the
   * only reason to believe that rather than believe its count is that better sources disagree with it.
   * An equal cannot be overruled: two 0.9 catalogues disagreeing is a disagreement, and the answer to
   * one of those is to show what the tier's majority says, never to delete the dissenter's episodes.
   *
   * Crunchyroll's fold is 0.5 against MAL's 0.9, and stays trimmed however many streaming catalogues
   * echo it, which is the case a sum of scores got wrong.
   */
  const overreaching = new Set(
    cluster
      .filter(media => media.episodeCount != null && media.episodeCount > length)
      .filter(media => (media.score ?? 0) < tier)
      .map(media => media.uri)
  )
  if (!overreaching.size) return [...episodes]

  return episodes.filter(episode =>
    !overreaching.has(episode.mediaUri)
    || episode.episodeNumber == null
    || episode.episodeNumber <= length)
}

/**
 * Every episode this cluster holds, renumbered onto the run's own numbering where another source
 * counts differently.
 *
 * READ TIME, AND A COPY. The stored node keeps Crunchyroll's own number, because it is keyed by
 * Crunchyroll's guid and is reachable through the whole season from other paths: `graph.set` is
 * last-write-wins, so rewriting it here would change what those other readers see. What the run needs
 * is a VIEW, and a view is what this returns.
 *
 * The reference is the members that agree about the run's length, which is the same set `runEpisodes`
 * trims against. A source that agrees about how long the run is is the one to measure another
 * source's numbering against; one that does not is exactly the source under suspicion.
 */
export const alignRunEpisodes = <T extends Episode>(
  cluster: readonly Media[],
  episodes: readonly T[]
): Map<string, T> => {
  const aligned = new Map<string, T>()
  const length = runLength(cluster)
  if (length == null) return aligned

  const reference = new Set(cluster.filter(media => media.episodeCount === length).map(media => media.uri))
  if (!reference.size) return aligned
  const anchors = episodes.filter(episode => reference.has(episode.mediaUri))
  if (!anchors.length) return aligned

  for (const media of cluster) {
    if (reference.has(media.uri)) continue
    const theirs = episodes.filter(episode => episode.mediaUri === media.uri)
    if (!theirs.length) continue
    const offset = alignmentOffset(anchors, theirs)
    // `== null`, not falsy: 0 is a real answer, and it means this source already counts the way the
    // run does. Treating it as absent is harmless here and wrong everywhere it would be copied.
    if (offset == null) continue
    for (const episode of theirs) {
      if (episode.episodeNumber == null) continue
      aligned.set(episode.uri, { ...episode, episodeNumber: episode.episodeNumber - offset })
    }
  }
  return aligned
}
