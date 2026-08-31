// Turning a bundled offline-database record into a stub media, kept apart from the extractor so it can be
// tested. The extractor pulls in the generated data module, which only exists after `npm run
// data:build`, and through the source barrel it also reaches a CommonJS `require('react')` that
// cannot load outside a browser. Same reason src/sources/season.ts and kitsu/season-paging.ts are
// their own files.

import type { Media as GQLMedia } from '../../generated/schema/types.generated'

import { MediaType } from '../../generated/graphql'
import { makeMedia } from '../utils'

export const origin = 'offline'

/**
 * Low on purpose, and below kitsu's 0.3.
 *
 * The media-level score decides which source wins `status`, `startDate`, `episodeCount`, `type` and
 * `averageScore`. This data is a static dump that can be weeks old, so on every one of those fields
 * it is by construction staler than a live API and should lose. Nothing is given up by being low:
 * the aggregate falls through with `??`, so a low-scored source still supplies any field no other
 * source has.
 *
 * The same value is used for the per-item title and cover scores, and that part matters more than
 * it looks. Titles at 0.9 would tie with anilist, jikan and anizip and push this dump's titles into
 * the six-slot profile the fuzzy merge compares clusters on, changing which titles every merge
 * decision sees. That is the exact mechanism behind the digit-residue regression that once welded
 * 68 unrelated shows into one component.
 */
export const SCORE = 0.2

const COVER_PREFIX = 'https://cdn.myanimelist.net/images/anime/'

/**
 * The cover url for a manami record, which is NOT always a MyAnimeList one.
 *
 * The bundle strips `COVER_PREFIX` to save about 42 bytes a row, and that is worth doing, but manami
 * takes each entry's picture from whichever source supplied it. Nine hosts appear in practice, so the
 * strip is a no-op on those rows and they stay absolute. Re-adding the prefix to one of them builds
 * `cdn.myanimelist.net/images/anime/https://media.kitsu.app/...`, which resolves nowhere.
 *
 * Measured 2026-09-01 against the shipped bundle: 380 of 874 season rows, 43%, carry an absolute url,
 * and 326 of those serve a real image once asked for the url they actually name. The rest are
 * livechart and anime-planet, which decline a hotlink; those at least now fail honestly.
 */
const coverUrl = (picture: string) => picture.startsWith('http') ? picture : `${COVER_PREFIX}${picture}`

export type ManamiRecord = {
  t: string
  ty: string
  p: string
  ep?: number
  ml?: number
  al?: number
  ku?: number
  sc?: number
}

/** `2026-SUMMER`, the key the generated bundle is keyed on. `animeSeasonOf` answers in lower case. */
export const seasonKey = ({ season, year }: { season: string, year: number }) =>
  `${year}-${season.toUpperCase()}`

const TYPES: Record<string, MediaType> = {
  TV: MediaType.Tv,
  MOVIE: MediaType.Movie,
  OVA: MediaType.Ova,
  ONA: MediaType.Ona,
  SPECIAL: MediaType.Special,
}

/**
 * A stable identity for a record that has no id of its own.
 *
 * manami is an aggregate over other catalogs and issues no id, so identity is borrowed from the
 * catalog ids it carries, in a fixed order so the same show keeps the same uri across builds. A
 * record carrying none is not rendered at all (see `seasonMedia`), which is why there is no
 * title-derived fallback here: a title is not an identity, and inventing one would produce a uri
 * that silently changes the day upstream fixes a typo.
 */
export const recordId = (record: ManamiRecord): string | undefined =>
  record.ml ? `mal-${record.ml}`
  : record.al ? `anilist-${record.al}`
  : record.ku ? `kitsu-${record.ku}`
  : undefined

const handles = (record: ManamiRecord): GQLMedia[] => {
  const list: GQLMedia[] = []
  if (record.ml) list.push(makeMedia({ origin: 'mal', id: String(record.ml), url: `https://myanimelist.net/anime/${record.ml}` }))
  if (record.al) list.push(makeMedia({ origin: 'anilist', id: String(record.al), url: `https://anilist.co/anime/${record.al}` }))
  if (record.ku) list.push(makeMedia({ origin: 'kitsu', id: String(record.ku), url: `https://kitsu.app/anime/${record.ku}` }))
  return list
}

/**
 * One record as a stub media, or nothing when it carries no catalog id.
 *
 * Dropping the id-less ones is the whole duplicate-control story. A record with no id cannot union
 * with anything, so if another source already describes that show the user sees the same title
 * twice with no way for the store to know. For SUMMER 2026 that is 79 of 219 records, and the ones
 * lost are overwhelmingly the obscure shorts and promos the other sources do not carry either.
 *
 * Deliberately absent: `status`, `startDate`, `endDate` and `popularity`. manami has no popularity
 * count at all, and its `status` is a snapshot taken when the dump was cut which decays immediately
 * (the 2026-07-04 dump calls 192 of its 219 SUMMER 2026 entries UPCOMING, and every one was airing
 * six weeks later). A null popularity is safe everywhere in the store and simply sorts these to the
 * end of the row when they do not merge, which is a useful tell that the merge did not happen.
 */
export const seasonMedia = (record: ManamiRecord): GQLMedia | undefined => {
  const id = recordId(record)
  if (!id) return undefined

  const type = TYPES[record.ty]
  return makeMedia({
    origin,
    id,
    handles: handles(record),
    score: SCORE,
    categories: type === MediaType.Movie ? ['ANIME', 'MOVIE'] : ['ANIME', 'SERIES'],
    type,
    titles: [{ language: 'en', title: record.t, score: SCORE }],
    covers: record.p ? [{ url: coverUrl(record.p), score: SCORE }] : [],
    episodeCount: record.ep || undefined,
    // manami scores on 1 to 10, the schema's averageScore is 0 to 100.
    averageScore: record.sc ? Math.round(record.sc * 10) : undefined,
  })
}

export const seasonPage = (records: readonly ManamiRecord[]): GQLMedia[] =>
  records.map(seasonMedia).filter((media): media is GQLMedia => Boolean(media))
