import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiShallowDeepEqual from 'chai-shallow-deep-equal'

use(chaiAsPromised)
use(chaiShallowDeepEqual)

// normalizeMedia can throw on a record (a malformed AniDB url, missing images), and under Promise.all one such record used to reject the whole page, so a single odd entry blanked the entire season
const anime = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  mal_id: id,
  type: 'TV',
  url: `https://myanimelist.net/anime/${id}`,
  score: 8,
  synopsis: 'x',
  title,
  title_english: title,
  title_japanese: title,
  images: { webp: { large_image_url: `https://img/${id}.webp` } },
  episodes: 12,
  members: 100,
  status: 'Currently Airing',
  aired: { from: '2026-01-01', to: null },
  trailer: null,
  external: [],
  ...extra
})

const ctxYielding = (body: unknown) => ({
  fetch: async () => ({ status: 200, json: async () => body })
}) as any

const drain = async (generator: AsyncGenerator<any>) => {
  const yielded: any[] = []
  for await (const value of generator) yielded.push(value)
  return yielded
}

const captureErrors = async <T>(run: () => Promise<T>): Promise<[T, string]> => {
  const original = console.error
  const lines: string[] = []
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  try {
    return [await run(), lines.join('\n')]
  } finally {
    console.error = original
  }
}

const mediaPage = async (input: Record<string, unknown>, ctx: any) => {
  const { resolvers } = await import('../src/sources/jikan/extractor')
  return drain((resolvers as any).Subscription.mediaPage.subscribe(undefined, { input }, ctx))
}

export const malformedRecordDoesNotBlankTheSeason = async () => {
  const body = {
    pagination: { last_visible_page: 1 },
    data: [
      anime(1, 'Good One'),
      anime(2, 'Bad AniDB Url', { external: [{ name: 'AniDB', url: 'not-a-url' }] }),
      anime(3, 'Good Two'),
      anime(4, 'No Images', { images: undefined })
    ]
  }
  const [yielded, errors] = await captureErrors(() => mediaPage({ status: 'RELEASING' }, ctxYielding(body)))
  const titles = yielded[0].mediaPage.nodes.map((node: any) => node.titles?.[0]?.title).sort()
  // The malformed record SURVIVES, and that is the fix rather than a regression: `new URL(...)` used
  // to run unguarded inside normalizeMedia, so one bad link threw and took its whole record away.
  // It now costs that one handle, which tests/unit/sources/jikan/extractor.test.ts pins as "a
  // malformed link costs one handle, not the record". This file kept asserting the old behaviour and
  // was the only red check in the suite from 2026-09-03 to 2026-09-06.
  expect(titles).to.deep.equal(['Bad AniDB Url', 'Good One', 'Good Two'])
  expect(errors).to.contain('Jikan season')
}

export const nonJsonSeasonPageDegradesToEmpty = async () => {
  const ctx = { fetch: async () => ({ status: 429, json: async () => { throw new Error('not json') } }) } as any
  const [yielded] = await captureErrors(() => mediaPage({ status: 'RELEASING' }, ctx))
  expect(yielded[0].mediaPage.nodes).to.deep.equal([])
}

export const healthySeasonIsUnaffected = async () => {
  const body = { pagination: { last_visible_page: 1 }, data: [anime(1, 'A'), anime(2, 'B')] }
  const [yielded] = await captureErrors(() => mediaPage({ status: 'RELEASING' }, ctxYielding(body)))
  expect(yielded[0].mediaPage.nodes.length).to.equal(2)
}
