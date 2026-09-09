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
