// The search page's card and list modes lead with "Ep 11 airing in 1 hour, 42 mins", and the schedule
// that answers it was already being fetched for `startDate`. Read by TIMESTAMP, never by position, for
// the reason tests/unit/sources/aired-date.test.ts records: AniList lists what it has SCHEDULED and
// neither the order nor the length of that list is a promise.
import { describe, expect, test } from 'vitest'

import { nextAiringEpisode } from '../../../src/sources/next-airing'

const NOW = new Date('2026-09-06T12:00:00Z')
const at = (iso: string, episode: number) => ({ node: { airingAt: Date.parse(iso) / 1000, episode } })

describe('nextAiringEpisode', () => {
  test('the soonest airing still ahead of now', () => {
    const schedule = { edges: [at('2026-09-13T15:30:00Z', 12), at('2026-09-06T15:30:00Z', 11)] }
    expect(nextAiringEpisode(schedule, NOW)).toEqual({
      episodeNumber: 11,
      airingAt: new Date('2026-09-06T15:30:00Z').toUTCString(),
    })
  })

  // The position trap, stated as a test: the earliest entry in the array is the one that already aired.
  test('an episode that already aired is never the next one', () => {
    const schedule = { edges: [at('2026-08-30T15:30:00Z', 10), at('2026-09-06T15:30:00Z', 11)] }
    expect(nextAiringEpisode(schedule, NOW)?.episodeNumber).toBe(11)
  })

  test('a finished run, an empty schedule and no schedule all answer nothing', () => {
    expect(nextAiringEpisode({ edges: [at('2026-08-30T15:30:00Z', 10)] }, NOW)).toBeUndefined()
    expect(nextAiringEpisode({ edges: [] }, NOW)).toBeUndefined()
    expect(nextAiringEpisode(null, NOW)).toBeUndefined()
    expect(nextAiringEpisode(undefined, NOW)).toBeUndefined()
  })

  // Half a node cannot render either half of the line, so it is skipped rather than shown with a hole.
  test('a node missing either member is skipped, and a later complete one still answers', () => {
    const schedule = {
      edges: [
        { node: { airingAt: Date.parse('2026-09-06T13:00:00Z') / 1000, episode: null } },
        { node: { airingAt: null, episode: 11 } },
        at('2026-09-06T15:30:00Z', 12),
      ],
    }
    expect(nextAiringEpisode(schedule, NOW)).toEqual({
      episodeNumber: 12,
      airingAt: new Date('2026-09-06T15:30:00Z').toUTCString(),
    })
  })
})
