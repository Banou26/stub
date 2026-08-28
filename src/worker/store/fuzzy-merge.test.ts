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

// A season number is identity, not similarity. `Slime Season 3` and `Season 4` score 0.929 and
// `Onii-chan!` and `Oniichan` score 0.833, so no threshold tells them apart: alignment charges the
// same for the digit that IS the identity as for the hyphen that is noise.
test('two seasons of one show do not merge on a shared alias', async () => {
  const third = [media('anilist:4000', [['Slime Season 3', 0.7], ['TenSura', 0.9]], SPRING_2026)]
  const fourth = [media('anilist:4001', [['Slime Season 4', 0.7], ['TenSura', 0.9]], SPRING_2026)]

  await upsertMedia([...third, ...fourth], [])
  await fuzzyMergeMediaClusters([third, fourth])

  const cluster = await findAggregatedMedia('anilist:4000')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:4000'])
})

// `第4期` and `Season 4` are the same claim, so the gate has to read both and let the pair through.
// Same shape as the test above with only the season changed, which is the whole difference.
test('the same season spelled two ways still merges', async () => {
  const romaji = [media('anilist:4100', [['Slime Season 4', 0.7], ['TenSura', 0.9]], SPRING_2026)]
  const native = [media('anizip:4101', [['転生したらスライムだった件 第4期', 0.9], ['TenSura', 0.9]], SPRING_2026)]

  await upsertMedia([...romaji, ...native], [])
  await fuzzyMergeMediaClusters([romaji, native])

  const cluster = await findAggregatedMedia('anilist:4100')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:4100', 'anizip:4101'])
})

// A bare trailing number is not a season (284 of 4159 real titles end in one and most name no
// season), so the season gate cannot see this pair. The values still have to be compared as numbers.
test('a bare trailing number is compared as a value', async () => {
  const sixteen = [media('anilist:4200', [['Yami Shibai 16', 0.9]], SPRING_2026)]
  const seventeen = [media('anilist:4201', [['Yami Shibai 17', 0.9]], SPRING_2026)]

  await upsertMedia([...sixteen, ...seventeen], [])
  await fuzzyMergeMediaClusters([sixteen, seventeen])

  const cluster = await findAggregatedMedia('anilist:4200')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:4200'])
})

// The guard above must not cost the merges the whole pass exists for: punctuation is still the
// normalizer's job and still free.
test('punctuation differences still merge', async () => {
  const hyphen = [media('anilist:4300', [['Onii-chan wa Oshimai!', 0.7]], SPRING_2026)]
  const joined = [media('mal:4301', [['Oniichan wa Oshimai', 0.9]], SPRING_2026)]

  await upsertMedia([...hyphen, ...joined], [])
  await fuzzyMergeMediaClusters([hyphen, joined])

  const cluster = await findAggregatedMedia('anilist:4300')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:4300', 'mal:4301'])
})

// Crunchyroll names most seasons by their position alone, so it publishes a media titled "Season 3",
// and HAS_LETTER waves that through because it is full of letters. Two unrelated shows on their third
// season then hold an IDENTICAL title and merge on the exact-title shortcut, no similarity needed.
// Measured live: "[MERGE] EXACT "season 3" :: anilist:199111 <> anilist:178789" put Grand Blue Dreaming
// and Mushoku Tensei in one cluster, and the modal rendered one under the other's name.
test('a title that is only a season label does not weld two shows', async () => {
  const grandBlue = [
    media('anilist:199111', [['Grand Blue Dreaming Season 3', 0.7]], SUMMER_2026),
    media('cr:GNVHKN94W', [['Season 3', 0.5]], SUMMER_2026),
  ]
  const mushoku = [
    media('anilist:178789', [['Mushoku Tensei: Jobless Reincarnation Season 3', 0.7]], SUMMER_2026),
    media('cr:G24H1N3MP', [['Season 3', 0.5]], SUMMER_2026),
  ]

  await upsertMedia([...grandBlue, ...mushoku], [
    { mediaUri: 'anilist:199111', handleUri: 'cr:GNVHKN94W' },
    { mediaUri: 'anilist:178789', handleUri: 'cr:G24H1N3MP' },
  ])
  await fuzzyMergeMediaClusters([grandBlue, mushoku])

  const cluster = await findAggregatedMedia('anilist:199111')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:199111', 'cr:GNVHKN94W'])
})

// and the same for the forms the other markers take, since one regex covers them all
test('the other season-only labels are refused too', async () => {
  // the SAME label on both, which is what the exact-title shortcut needs and what two shows on their
  // second season actually get from Crunchyroll
  const a = [media('anilist:4400', [['Some Show 2nd Season', 0.7]], SPRING_2026), media('cr:AAA', [['2nd Season', 0.5]], SPRING_2026)]
  const b = [media('anilist:4401', [['Another Show 2nd Season', 0.7]], SPRING_2026), media('cr:BBB', [['2nd Season', 0.5]], SPRING_2026)]

  await upsertMedia([...a, ...b], [
    { mediaUri: 'anilist:4400', handleUri: 'cr:AAA' },
    { mediaUri: 'anilist:4401', handleUri: 'cr:BBB' },
  ])
  await fuzzyMergeMediaClusters([a, b])

  const cluster = await findAggregatedMedia('anilist:4400')
  expect(cluster.map(m => m.uri).sort()).toEqual(['anilist:4400', 'cr:AAA'])
})
