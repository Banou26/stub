// Import-free at runtime for the reason ./aired-date.ts gives; the type below is erased.
import type { AiringEdges } from './aired-date'

/** An episode a source has scheduled and that has not aired yet. */
export type NextAiringEpisode = { episodeNumber: number, airingAt: string }

/**
 * The soonest episode a schedule still has ahead of it, or nothing.
 *
 * Read by EARLIEST TIMESTAMP, never by array position, for the reason `airedDate` records: AniList
 * lists what it has SCHEDULED, and neither the order nor the length of that list is a promise. A
 * finished run has nothing left in it and answers `undefined`, which is what every non-airing media
 * says.
 *
 * Both members are required. A node carrying a time but no episode number cannot say "Ep N airing
 * in", and a number with no time cannot count down, so a half-populated node is skipped rather than
 * rendered with a hole in it.
 */
export const nextAiringEpisode = (schedule: AiringEdges, now = new Date()): NextAiringEpisode | undefined => {
  const nowSeconds = now.getTime() / 1000
  const upcoming =
    (schedule?.edges ?? [])
      .map(edge => edge?.node)
      .filter((node): node is { airingAt: number, episode: number } =>
        typeof node?.airingAt === 'number' && typeof node.episode === 'number' && node.airingAt > nowSeconds)
  if (!upcoming.length) return undefined

  const soonest = upcoming.reduce((earliest, node) => node.airingAt < earliest.airingAt ? node : earliest)
  return {
    episodeNumber: soonest.episode,
    airingAt: new Date(soonest.airingAt * 1000).toUTCString(),
  }
}
