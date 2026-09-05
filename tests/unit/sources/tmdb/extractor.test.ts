// A tmdb id is a SHOW id: '94664' is every season of Mushoku Tensei at once, and only the '-s<n>' form
// names one run. So the bare row (search, or a media-path fallback with no season to pick) goes out
// scoped CONTAINER, and the store keeps it out of every run's identity space.
import { expect, test } from 'vitest'

import { resolvers } from '../../../../src/sources/tmdb/extractor'

const BASE = 'https://www.themoviedb.org'

const SEARCH_HTML = `
<div class="card" data-media-type="tv">
  <a href="/tv/94664-mushoku-tensei-jobless-reincarnation"><img alt="Mushoku Tensei: Jobless Reincarnation" src="https://media.themoviedb.org/t/p/w94/poster.jpg"></a>
  <a href="/tv/94664-mushoku-tensei-jobless-reincarnation"><h2>Mushoku Tensei: Jobless Reincarnation</h2></a>
  <span class="release_date">January 11, 2021</span>
</div>`

const showHtml = (id: string, seasons: number[]) => `
<meta property="og:title" content="Mushoku Tensei: Jobless Reincarnation">
<meta property="og:description" content="Reborn as a baby.">
<meta property="og:image" content="https://media.themoviedb.org/t/p/w600/poster.jpg">
${seasons.map(n => `<a href="/tv/${id}/season/${n}">Season ${n}</a>`).join('\n')}`

const seasonHtml = (episodes: number) =>
  Array.from({ length: episodes }, (_, i) => `<div class="card" data-episode-number="${i + 1}"><h3><a href="#">Episode ${i + 1}</a></h3></div>`).join('\n')

// misses are COLLECTED rather than thrown: `fetchHtml` swallows a rejection with `.catch(() => undefined)`,
// so a drifted fixture would return no media and fail on a line that says nothing about the fixture.
const context = (misses: string[]) => ({
  key: () => undefined,
  fetch: async (url: string) => {
    const html = (body: string) => ({ ok: true, status: 200, text: async () => body })
    if (url.startsWith(`${BASE}/search/tv?query=`)) return html(SEARCH_HTML)
    if (url.startsWith(`${BASE}/tv/94664?`)) return html(showHtml('94664', [1, 2, 3]))
    if (url.startsWith(`${BASE}/tv/94664/season/3?`)) return html(seasonHtml(24))
    // a show page with no season links: nothing to pick, so the bare id comes back
    if (url.startsWith(`${BASE}/tv/777?`)) return html(showHtml('777', []))
    misses.push(url)
    return { ok: false, status: 404, text: async () => '' }
  },
}) as never

type Row = { uri: string, scope?: string, episodes?: unknown[] }

const mediaFor = async (uri: string): Promise<Row> => {
  const misses: string[] = []
  const subscribe = (resolvers.Subscription as any).media.subscribe
  const { value } = await subscribe(undefined, { input: { uri } }, context(misses)).next()
  expect(misses, 'the fixture has drifted: these urls had no route').toEqual([])
  expect(value?.media, 'the media itself must exist for its scope to mean anything').not.toBeNull()
  return value.media
}

const searchRows = async (): Promise<Row[]> => {
  const misses: string[] = []
  const subscribe = (resolvers.Subscription as any).mediaPage.subscribe
  const { value } = await subscribe(undefined, { input: { search: 'mushoku' } }, context(misses)).next()
  expect(misses, 'the fixture has drifted: these urls had no route').toEqual([])
  return value.mediaPage.nodes
}

test('a season-scoped media is a RUN', async () => {
  const media = await mediaFor('tmdb:94664-s3')

  expect(media.uri).toBe('tmdb:94664-s3')
  expect(media.episodes, 'the pinned season must be the one fetched').toHaveLength(24)
  expect(media.scope).toBe('RUN')
})

test('a search row carries the bare show id and is a CONTAINER', async () => {
  const rows = await searchRows()

  expect(rows.map(row => row.uri)).toEqual(['tmdb:94664'])
  expect(rows[0]!.scope).toBe('CONTAINER')
})

// getMedia hands back the bare id when the show page lists no season to pick, so the media path can
// mint a show-level row too, and it has to say so.
test('a media-path row that falls back to the bare show id is a CONTAINER', async () => {
  const media = await mediaFor('tmdb:777')

  expect(media.uri).toBe('tmdb:777')
  expect(media.scope).toBe('CONTAINER')
})
