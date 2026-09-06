/** How a rating reads at a glance, which is what picks the face and the colour beside it. */
export type ScoreMood = 'good' | 'mixed' | 'poor'

/**
 * A 0 to 100 `Media.averageScore` as a mood.
 *
 * The two thresholds are AniList's own, so a media carries the same face here as on the page most
 * of these ratings come from.
 */
export const scoreMood = (percent: number): ScoreMood =>
  percent >= 75 ? 'good'
  : percent >= 60 ? 'mixed'
  : 'poor'
