// A handle used to do two jobs at once: carry a url AND assert sameness. A source holding only a
// show-level id therefore had to choose between lying and staying silent, and `SHOW_LEVEL_ORIGINS`
// chose silence: an `imdb:tt...` handle was STORED as a row and then never linked, so nothing on the
// read side could reach it. The comment that stood above that Set said the cost was "the IMDb link
// disappearing from the aggregated media, which is the smaller loss".
//
// PART_OF is the third option. It rides a directed edge that unions nothing, so the url survives while
// the claim does not.
import { beforeEach, expect, test } from 'vitest'

import { aggregateMedia, sameAsHandleUris } from './aggregate'
import { findAggregatedMedia, linkSameMediaPairs, resetStore, upsertMedia } from './db'

const media = (uri: string, url?: string) => ({
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  type: 'TV',
  categories: ['ANIME', 'SERIES'],
  titles: [{ language: 'en', title: uri, score: 1 }],
  ...url ? { url } : {},
}) as any

const IMDB_URL = 'https://www.imdb.com/title/tt13303712'

beforeEach(() => { resetStore() })

const aggregateOf = async (uri: string) => aggregateMedia(await findAggregatedMedia(uri), 'https://x')

test('an imdb handle reaches the aggregated media, carrying its url', async () => {
  await upsertMedia(
    [media('anilist:178789'), media('imdb:tt13303712', IMDB_URL)],
    [{ mediaUri: 'anilist:178789', handleUri: 'imdb:tt13303712', relation: 'SAME_AS' }]
  )

  const handles = (await aggregateOf('anilist:178789')).handles
  const imdb = handles.find(handle => handle.node.origin === 'imdb')

  expect(imdb, 'the imdb row must be reachable, which is the whole point').toBeDefined()
  expect(imdb!.node.url).toBe(IMDB_URL)
})

// The demotion, and why it is not merely a relabelling. A SAME_AS for imdb is corrected to PART_OF in
// `upsertMedia` whatever the producer asked for, because an imdb id names a SHOW and there is no
// season-level equivalent to name instead.
test('the imdb handle is PART_OF, never SAME_AS, however it was offered', async () => {
  await upsertMedia(
    [media('anilist:178789'), media('imdb:tt13303712', IMDB_URL)],
    [{ mediaUri: 'anilist:178789', handleUri: 'imdb:tt13303712', relation: 'SAME_AS' }]
  )

  const imdb = (await aggregateOf('anilist:178789')).handles.find(handle => handle.node.origin === 'imdb')
  expect(imdb!.relation).toBe('PART_OF')
})

// THE CONTROL, and the reason the whole design is worth anything. Two runs of one show carry the SAME
// imdb id: that is what imdb IS. Under SAME_AS they weld into one media, permanently, which is the
// defect `SHOW_LEVEL_ORIGINS` was created to prevent. PART_OF has to keep them apart while still
// giving both the link.
test('two runs sharing one imdb id stay two media, and both get the link', async () => {
  await upsertMedia(
    [media('anilist:108465'), media('anilist:178789'), media('imdb:tt13303712', IMDB_URL)],
    [
      { mediaUri: 'anilist:108465', handleUri: 'imdb:tt13303712', relation: 'SAME_AS' },
      { mediaUri: 'anilist:178789', handleUri: 'imdb:tt13303712', relation: 'SAME_AS' },
    ]
  )

  const season1 = await findAggregatedMedia('anilist:108465')
  const season3 = await findAggregatedMedia('anilist:178789')

  expect(season1.map(m => m.uri), 'the two runs must not have welded').toEqual(['anilist:108465'])
  expect(season3.map(m => m.uri)).toEqual(['anilist:178789'])

  for (const uri of ['anilist:108465', 'anilist:178789']) {
    const imdb = (await aggregateOf(uri)).handles.find(handle => handle.node.origin === 'imdb')
    expect(imdb?.node.url, `${uri} must still carry the link`).toBe(IMDB_URL)
  }
})

// A PART_OF handle must never be mistaken for cluster membership: the aggregated uri IS the identity
// list, and a stale bookmark carrying it would rebuild the claim on the next visit.
test('a PART_OF row is not in the cluster, so it is not in the aggregated uri', async () => {
  await upsertMedia(
    [media('anilist:178789'), media('kitsu:49002'), media('imdb:tt13303712', IMDB_URL)],
    [
      { mediaUri: 'anilist:178789', handleUri: 'kitsu:49002', relation: 'SAME_AS' },
      { mediaUri: 'anilist:178789', handleUri: 'imdb:tt13303712', relation: 'SAME_AS' },
    ]
  )

  const aggregated = await aggregateOf('anilist:178789')

  expect(aggregated.uri).toContain('kitsu:49002')
  expect(aggregated.uri, 'imdb names a show, so it may not name this media').not.toContain('imdb:')
})

// And the ordinary case has to keep working: an origin that CAN name a run still unions.
test('a per-run handle still unions the cluster', async () => {
  await upsertMedia(
    [media('anilist:178789'), media('kitsu:49002')],
    [{ mediaUri: 'anilist:178789', handleUri: 'kitsu:49002', relation: 'SAME_AS' }]
  )

  const cluster = await findAggregatedMedia('anilist:178789')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:178789', 'kitsu:49002'])
})

// `Media.episodes` is the most dangerous read in the tree, and the reason is not obvious from the call
// site: it hands every uri it is given to `findAggregatedEpisodesForMedia`, which walks HAS_EPISODE per
// uri, and then groups the union by `episodeNumber` ALONE. A PART_OF node is a SHOW, and unogs hangs
// EVERY season's episodes, each renumbered 1..n, off exactly that kind of uri. One leaked PART_OF and
// this run's page lists the longest season's worth of rows, which is the 24-rows defect returning.
//
// The resolver cannot be imported under vitest (it reaches urql, which is CommonJS), so the rule lives
// in `sameAsHandleUris` where it can be pinned.
test('the episode read takes SAME_AS uris only, never a PART_OF show', () => {
  const handles = [
    { relation: 'SAME_AS', node: { uri: 'kitsu:49002' } },
    { relation: 'PART_OF', node: { uri: 'nf:80987039' } },
    { relation: 'SAME_AS', node: { uri: 'anilist:178789' } },
  ]

  expect(sameAsHandleUris(handles)).toEqual(['kitsu:49002', 'anilist:178789'])
  expect(sameAsHandleUris(handles), 'a show-level uri here is every run\'s episodes at once')
    .not.toContain('nf:80987039')
  expect(sameAsHandleUris(undefined)).toEqual([])
})

// THE HOLE THE REFACTOR LEFT, found 2026-09-05 by tracing a live weld rather than by reading.
//
// Every guard the handle refactor added lives inside `upsertMedia`'s loop. `linkSameMediaPairs` is a
// SECOND way into the same union-find, called only by `fuzzyMergeMediaClusters`, and it was a raw
// `graph.link`: no relation, no demotion, no check. So an origin that no source is allowed to mint as
// SAME_AS could still be welded to a cour by a title match, and `SHOW_LEVEL_ORIGINS` protected nothing
// on that path.
//
// There is no PART_OF fallback here, because there is no handle: nothing asserted a containment, a
// title simply looked similar. The pair is refused.
test('a fuzzy title merge cannot weld a show-level origin either', async () => {
  await upsertMedia([media('anilist:178789'), media('imdb:tt13303712', IMDB_URL)], [])

  // what fuzzy-merge does when it decides two clusters are one, with no handle between them
  const changed = linkSameMediaPairs([['anilist:178789', 'imdb:tt13303712']])

  expect(changed, 'the pair must be refused outright').toBe(false)
  expect((await findAggregatedMedia('anilist:178789')).map(m => m.uri)).toEqual(['anilist:178789'])
})

// The control: the same call must still work for two origins that CAN name a run, or the refusal has
// been widened into a ban on fuzzy merging at all.
test('a fuzzy title merge still unions two per-run origins', async () => {
  await upsertMedia([media('anilist:178789'), media('kitsu:49002')], [])

  expect(linkSameMediaPairs([['anilist:178789', 'kitsu:49002']])).toBe(true)
  expect((await findAggregatedMedia('anilist:178789')).map(m => m.uri).sort())
    .toEqual(['anilist:178789', 'kitsu:49002'])
})
