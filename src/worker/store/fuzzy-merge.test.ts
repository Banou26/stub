import { expect, test } from 'vitest'

import { upsertMedia, findAggregatedMedia } from './db'
import { fuzzyMergeMediaClusters } from './fuzzy-merge'

const SPRING_2026 = '2026-04-03T15:00:00Z'
const SUMMER_2026 = '2026-07-05T15:00:00Z'

const media = (uri: string, titles: [string, number][], startDate: string) => ({
  uri, origin: uri.slice(0, uri.indexOf(':')), id: uri.slice(uri.indexOf(':') + 1),
  type: 'TV', categories: ['ANIME', 'SERIES'], startDate,
  titles: titles.map(([title, score]) => ({ language: 'ja', title, score })),
}) as any

// Normalizing a title to [a-z0-9] erased ani.zip's "転生したらスライムだった件 (2026)" down to the string
// "2026", which was equal to every other show airing that year: Slime's 4th season absorbed an unrelated
// TV_SHORT, and the same key put 31 shows in one component.
test('a japanese title that shares only its year does not weld two shows', async () => {
  const slime = [
    media('anilist:182205', [['Tensei Shitara Slime Datta Ken 4th Season', 0.7], ['転生したらスライムだった件 第4期', 0.7]], SPRING_2026),
    media('anizip:18884', [['That Time I Got Reincarnated as a Slime (2026)', 0.9], ['転生したらスライムだった件 (2026)', 0.9]], SPRING_2026),
  ]
  const aware = [media('anilist:205116', [['Aware! Meisaku-kun (2026)', 0.7], ['あはれ！名作くん (2026)', 0.7]], SUMMER_2026)]

  await upsertMedia([...slime, ...aware], [{ mediaUri: 'anilist:182205', handleUri: 'anizip:18884' }])
  await fuzzyMergeMediaClusters([await findAggregatedMedia('anilist:182205'), await findAggregatedMedia('anilist:205116')])

  const cluster = await findAggregatedMedia('anilist:182205')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:182205', 'anizip:18884'])
})

// Dropping non-latin titles instead of keeping them also stops the weld, and silently costs every merge
// two sources reach by agreeing on the japanese title, which is the one they agree on most often.
test('two sources that agree on the same japanese title still merge', async () => {
  const anilist = [media('anilist:1000', [['転生したらスライムだった件 第4期', 0.7]], SPRING_2026)]
  const anizip = [media('anizip:1001', [['転生したらスライムだった件 第4期', 0.9]], SPRING_2026)]

  await upsertMedia([...anilist, ...anizip], [])
  await fuzzyMergeMediaClusters([anilist, anizip])

  const cluster = await findAggregatedMedia('anilist:1000')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:1000', 'anizip:1001'])
})

test('two sources that agree on the same latin title still merge', async () => {
  const anilist = [media('anilist:2000', [['That Time I Got Reincarnated as a Slime (2026)', 0.7]], SPRING_2026)]
  const kitsu = [media('kitsu:2001', [['That Time I Got Reincarnated as a Slime 2026', 0.3]], SPRING_2026)]

  await upsertMedia([...anilist, ...kitsu], [])
  await fuzzyMergeMediaClusters([anilist, kitsu])

  const cluster = await findAggregatedMedia('anilist:2000')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:2000', 'kitsu:2001'])
})

// "第2期" and "第2クール" both left "2" behind, so it was the busiest key of all: 60 shows, among them
// Dandadan, Frieren and Kusuriya no Hitorigoto.
test('a bare number title is not an identity', async () => {
  const slave = [media('anilist:3000', [['Mato Seihei no Slave 2', 0.7], ['2', 0.9]], SPRING_2026)]
  const medalist = [media('anilist:3001', [['Medalist 2nd Season', 0.7], ['2', 0.9]], SPRING_2026)]

  await upsertMedia([...slave, ...medalist], [])
  await fuzzyMergeMediaClusters([slave, medalist])

  const cluster = await findAggregatedMedia('anilist:3000')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:3000'])
})
