import type { Episode, Media } from './types'

/**
 * What the sources AGREE on, weighted by how much each is trusted.
 *
 * The store's other resolutions take the highest-scored source's value and stop (`acc.x ?? gql.x` over
 * a score-sorted list), so one source outvotes any number of others however many agree with each
 * other. That is right for a title, where sources are spelling the same thing differently and the
 * best-scored spelling is simply the one to show. It is wrong for a NUMBER, where sources are making
 * a claim about the world and disagreement means one of them is mistaken.
 *
 * Each distinct value is credited the SUM of the scores claiming it, and the greatest total wins.
 *
 * NOT the value times anything. The owner's sketch was `11 * 2 * 0.8 > 24 * 1 * 0.6`, which multiplies
 * by the claim itself and so favours the larger number for being larger: one source claiming 24 would
 * score 14.4 against one claiming 11 at 8.8, and the bigger packaging would win every time it was
 * alone. What is being weighed is the WITNESSES, so only their scores are summed.
 *
 * WHAT THIS DOES NOT MODEL, and it is worth knowing before trusting a margin: the witnesses are not
 * independent. Several catalogues restate MAL, so agreement between them is one source counted twice.
 * The per-source scores already discount the derivative ones (kitsu 0.3 against anizip and mal 0.9),
 * which is the whole of the correction here. A close result means "the sources disagree", not "the
 * winner is 0.2 more likely".
 */
export const weightedConsensus = <T>(
  claims: readonly { value: T | null | undefined, score?: number | null }[]
): T | undefined => {
  const weight = new Map<T, { total: number, best: number }>()
  for (const { value, score } of claims) {
    if (value == null) continue
    const seen = weight.get(value) ?? { total: 0, best: 0 }
    // a source with no score of its own still counts as a witness, just the lightest one
    const own = score ?? 0
    weight.set(value, { total: seen.total + own, best: Math.max(seen.best, own) })
  }

  let winner: T | undefined
  // NOT `{ total: 0 }`: a lone claim from an unscored source weighs zero, and starting the incumbent
  // at zero would leave it losing to nothing at all. anizip's media row is unscored, so that is the
  // ordinary case for an older run rather than a corner of one.
  let winning: { total: number, best: number } | undefined
  for (const [value, seen] of weight) {
    // the best single score breaks a tie, so two lightweights never displace one authority on equal
    // total, and an exact tie keeps the first claim in the order the caller gave
    if (!winning || seen.total > winning.total || (seen.total === winning.total && seen.best > winning.best)) {
      winner = value
      winning = seen
    }
  }
  return winner
}

/** How long the sources say this run is, or nothing when none of them says. */
export const runLength = (cluster: readonly Media[]): number | undefined =>
  weightedConsensus(cluster.map(media => ({ value: media.episodeCount, score: media.score })))

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
  const length = runLength(cluster)
  if (length == null) return [...episodes]

  /**
   * TWO WITNESSES, and one of them heavier than whoever is being trimmed.
   *
   * The bar is here because half the counts in this tree are not claims at all: twelve sources set
   * `episodeCount = episodes.length`, so a catalogue that could only reach part of a run publishes a
   * SHORT count as confidently as a catalogue that knows the whole one. Enough of those agreeing
   * would carry a consensus below the truth, and trimming on it would hide episodes that aired.
   *
   * Requiring a second witness means a wrong consensus has to be wrong in company before it can cost
   * anything. It is the difference between "the sources disagree and here is the majority" and "the
   * sources agree and one of them is describing something longer", and only the second is worth
   * acting on.
   *
   * A weight comparison was tried here too and deleted as dead: the consensus only wins by carrying
   * more weight than any other value, so a member claiming a different one always scores under it and
   * the test could never fail. Mutation caught that; reading it did not.
   */
  const backing = cluster.filter(media => media.episodeCount === length)
  if (backing.length < 2) return [...episodes]
  const weight = backing.reduce((total, media) => total + (media.score ?? 0), 0)

  /**
   * AND TWICE THE WEIGHT of whoever is being trimmed, because a narrow win is a disagreement.
   *
   * Measured over the 100 cluster snapshot in dist-seed on 2026-09-09: 35 of them disagree about
   * their own length, and one shape recurs, `anilist(0.8)=13 anizip(null)=12 kitsu(0.3)=22
   * mal(0.9)=12`. The consensus there is 12 by 0.9 against anilist's 0.8, a margin of 0.1, and
   * trimming on it would hide a thirteenth episode that anilist alone may well be right about. The
   * same run's kitsu row says 22, backed by 0.3 against 0.9, and that one is a show-level count that
   * should go.
   *
   * Twice is the line between those two. It is not swept, it is chosen to make a lone dissenter
   * cheap to overrule and a real disagreement impossible to: Mushoku Tensei's fold is 2.0 against
   * Crunchyroll's 0.5, four times over.
   */
  const claimWeight = new Map<number, number>()
  for (const media of cluster) {
    if (media.episodeCount == null) continue
    claimWeight.set(media.episodeCount, (claimWeight.get(media.episodeCount) ?? 0) + (media.score ?? 0))
  }

  const overreaching = new Set(
    cluster
      .filter(media => media.episodeCount != null && media.episodeCount > length)
      .filter(media => weight >= 2 * (claimWeight.get(media.episodeCount!) ?? 0))
      .map(media => media.uri)
  )
  if (!overreaching.size) return [...episodes]

  return episodes.filter(episode =>
    !overreaching.has(episode.mediaUri)
    || episode.episodeNumber == null
    || episode.episodeNumber <= length)
}
