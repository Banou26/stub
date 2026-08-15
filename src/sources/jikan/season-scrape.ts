// The MAL seasonal page, parsed out of its HTML. Split out with NO imports so it can be tested: an
// extractor pulls in the source barrel and, through it, a CommonJS `require('react')` that cannot
// load outside a browser. Same reason ../season.ts and ../kitsu/season-paging.ts are their own
// modules.
//
// This exists because Jikan, the API this source normally uses, is unreachable from the FKN proxy's
// egress: every endpoint answers 504 "Jikan failed to connect to MyAnimeList" from both regions
// while myanimelist.net itself serves the same egress fine. So the scrape is the FALLBACK for a
// source stub already has, not a new source: this extractor's origin is `mal` either way, and both
// paths key on the same MAL id, so records from them merge rather than duplicating.
//
// Regex rather than a DOM parse, matching how src/sources/tmdb/extractor.ts already scrapes.

/** One entry from the seasonal grid. Every field except id and title may be missing. */
export type MalSeasonEntry = {
  id: string
  title: string
  englishTitle?: string
  cover?: string
  synopsis?: string
  score?: number
  members?: number
  episodes?: number
  startDate?: string
  typeId?: number
}

/**
 * MAL's own numeric type ids, confirmed against the section headings on the same page: the counts
 * per id matched TV 130, ONA 40, Movie 25, OVA 12 exactly. 9 is TV Special, added later than the
 * rest, which is why it does not sit next to 4.
 */
export const MAL_TYPE = {
  1: 'TV', 2: 'OVA', 3: 'MOVIE', 4: 'SPECIAL', 5: 'ONA', 6: 'MUSIC', 9: 'SPECIAL',
} as const

/** `20260706` as MAL writes it, to an ISO date. Anything else is treated as absent. */
export const malDate = (raw?: string): string | undefined => {
  if (!raw || !/^\d{8}$/.test(raw)) return undefined
  const [year, month, day] = [raw.slice(0, 4), raw.slice(4, 6), raw.slice(6, 8)]
  if (month === '00' || day === '00') return undefined
  return `${year}-${month}-${day}`
}

const decodeEntities = (text: string) =>
  text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

const text = (raw?: string) => {
  if (!raw) return undefined
  const cleaned = decodeEntities(raw.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
  return cleaned || undefined
}

const num = (raw?: string) => {
  if (!raw) return undefined
  const value = Number(raw.replace(/,/g, ''))
  return Number.isFinite(value) ? value : undefined
}

const one = (block: string, pattern: RegExp) => pattern.exec(block)?.[1]

/**
 * Every entry on a MAL season page.
 *
 * Splitting on `js-anime-category-producer` rather than a wrapper element: it is the class the grid
 * puts on each card, and counting it gave exactly the 209 the page claims, where matching a nested
 * `<div>` would need real parsing to find its close tag.
 */
export const parseMalSeason = (html: string): MalSeasonEntry[] => {
  const entries: MalSeasonEntry[] = []
  const seen = new Set<string>()

  for (const block of html.split('js-anime-category-producer').slice(1)) {
    const id = one(block, /myanimelist\.net\/anime\/(\d+)/) ?? one(block, /class="genres js-genre" id="(\d+)"/)
    const title = text(one(block, /class="link-title">([^<]+)</))
    // A card with no id cannot be merged with anything, and one with no title cannot be displayed.
    if (!id || !title || seen.has(id)) continue
    seen.add(id)

    // The grid lazy-loads further down the page, so the same img is `src` on the first screenful
    // and `data-src` after it. Matching only one silently loses most of the covers.
    const cover = one(block, /<img[^>]*\bdata-src="(https:\/\/cdn\.myanimelist\.net\/images\/anime\/[^"]+)"/)
      ?? one(block, /<img[^>]*\bsrc="(https:\/\/cdn\.myanimelist\.net\/images\/anime\/[^"]+)"/)

    entries.push({
      id,
      title,
      englishTitle: text(one(block, /class="h3_anime_subtitle">([^<]*)</)),
      cover,
      synopsis: text(one(block, /class="preline">([\s\S]*?)<\/p>/)),
      // js-score carries `N/A` for an unrated title, which must not become NaN
      score: num(one(block, /class="js-score">([\d.]+)</)),
      members: num(one(block, /class="js-members">([\d,]+)</)),
      episodes: num(one(block, /<span>\s*(\d+)\s*eps?\s*<\/span>/)),
      startDate: malDate(one(block, /class="js-start_date">(\d+)</)),
      typeId: num(one(block, /js-anime-type-(\d+)/)),
    })
  }
  return entries
}
