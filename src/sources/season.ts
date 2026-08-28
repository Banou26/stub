// Season identity for sources that model a SHOW where stub models a season.
//
// TMDB, JustWatch, IMDb and TVmaze all describe a series as one entity with seasons hanging off it.
// Stub has no such entity - every media here is one season - so a source that hands back the show's id
// hands the same id back for every season, and clustering union-finds them into a single media. That
// is what merged all three Mushoku Tensei seasons, and what made picking season 2 out of search open
// season 3.
//
// Split into its own module with NO imports so it can be tested: an extractor pulls in the source
// barrel and, through it, a CommonJS `require('react')` that cannot load outside a browser.

/**
 * The four broadcast seasons, indexed by calendar quarter.
 *
 * Every catalogue that models a season agrees on this split (Jan to Mar is winter, and so on), so a
 * source only has to spell the names differently, never the boundaries.
 */
export const ANIME_SEASONS = ['winter', 'spring', 'summer', 'fall'] as const
export type AnimeSeason = (typeof ANIME_SEASONS)[number]

/**
 * Which season a date falls in. Shared rather than per-extractor so a new seasonal source cannot
 * quietly disagree with the others about which season "now" is, which would show two different
 * catalogues on one page for the three months they disagreed.
 */
export const animeSeasonOf = (date = new Date()): { season: AnimeSeason, year: number } => ({
  season: ANIME_SEASONS[Math.floor(date.getMonth() / 3)]!,
  year: date.getFullYear()
})

const CJK_DIGITS: Record<string, number> = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

// 十 is a multiplier, not a digit: 十二 is 12, 二十 is 20, 二十一 is 21.
const cjkNumber = (text: string): number | undefined => {
  if (/^\d+$/.test(text)) return Number(text)
  let total = 0
  let current = 0
  for (const char of text) {
    if (char === '十') {
      total += (current || 1) * 10
      current = 0
      continue
    }
    const digit = CJK_DIGITS[char]
    if (digit === undefined) return undefined
    current = digit
  }
  return total + current || undefined
}

// Every season spelling the metadata sources actually use, counted over 4159 real AniList and ani.zip
// titles: `Season N` 176, `Nth Season` 81, `第N季` 62, `第N期` 43, `Part N` 31, `S<N>` 27, `シーズンN` 11,
// `Cour N` 6, `N기` 1. Only the first and the sixth used to parse, so half of every catalogue looked
// season-less and a show could not be told apart from its own next season.
//
// 話 and 集 are deliberately absent: those count episodes.
//
// The ordinal form is tried FIRST because the prefix form can read straight through it: the number
// after the word in `4th Season 2-nensei-hen Ichi Gakki` belongs to the subtitle, and matching
// `Season 2` there called the 4th season the 2nd. Nothing is lost by the order, since `Season 4`
// carries no ordinal for the first pattern to find.
const SEASON_PATTERNS = [
  /\b(\d{1,3})(?:st|nd|rd|th)\s+(?:season|part|cour)\b/i,
  /\b(?:season|part|cour)\s*(\d{1,3})\b/i,
  /シーズン\s*(\d{1,3})/,
  /第\s*([\d〇零一二三四五六七八九十]{1,4})\s*[期季]/,
  /(\d{1,3})\s*[期기]/,
  /\bS(\d{1,2})\b/,
]

/**
 * The same grammar as a REMOVAL, for building a shorter search query out of a title.
 *
 * Deliberately narrower than SEASON_PATTERNS, because reading a number and deleting text carry
 * different risks. `\bS\d\b` is left out: it reads a season fine but deleting a bare `S2` out of a
 * title that merely contains one costs more than the query it would buy. The word ordinals are here
 * and not above for the mirror reason, they only ever appear as a season and there is nothing to
 * read off them that the catalogue query needs.
 *
 * Global, so a title carrying both `Season 2` and `Part 2` loses both.
 */
export const SEASON_MARKER: readonly RegExp[] = [
  /\s*\b(?:(?:season|part|cour)\s*\d{1,3}|\d{1,3}(?:st|nd|rd|th)\s+(?:season|part|cour)|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:season|part|cour))\b/gi,
  /\s*(?:シーズン\s*\d{1,3}|第\s*[\d〇零一二三四五六七八九十]{1,4}\s*[期季])/g,
]

const HAS_LETTER = /\p{L}/u

/**
 * A title that is nothing but a season label, so it names a POSITION and never a show.
 *
 * Crunchyroll titles a season the way its catalogue does, which for a great many series is the literal
 * string "Season 3", and that title reaches the store as the media's own. Two unrelated shows both
 * carrying it are then identical to any comparison made on titles alone: it is what merged
 * "Grand Blue Dreaming Season 3" into "Mushoku Tensei Season 3", measured on the exact-title shortcut
 * in the fuzzy merge, and it merged a different pair on almost every run because it only needs two
 * shows on their third season to be on screen together.
 *
 * `\p{L}` alone does not catch these: "season 3" is full of letters. What makes it empty is that
 * removing the season markers leaves nothing behind.
 */
export const isOnlySeasonLabel = (title: string): boolean =>
  !HAS_LETTER.test(SEASON_MARKER.reduce((text, marker) => text.replace(marker, ' '), title))

/** 'Mushoku Tensei Season 3', '... 2nd Season', '転生したら剣でした 第2期', '幼女战记 第二季' -> the number. */
export const parseSeasonNumber = (title: string): number | undefined => {
  for (const pattern of SEASON_PATTERNS) {
    const match = pattern.exec(title)
    if (match) {
      const value = cjkNumber(match[1]!)
      if (value !== undefined) return value
    }
  }
  return undefined
}

/**
 * Which season has about this many episodes.
 *
 * The fallback for when nothing in the title says. Ambiguous by nature - two seasons of twelve are
 * indistinguishable this way - so it is only ever reached after the title has been tried, and it
 * returns nothing at all when there is only one season, because then there is nothing to choose.
 */
export const pickSeasonByEpisodeCount = (
  seasons: { seasonNumber: number, episodeCount: number }[],
  targetCount: number
): number | undefined => {
  if (seasons.length <= 1) return undefined
  let best: { seasonNumber: number, diff: number } | undefined
  for (const season of seasons) {
    const diff = Math.abs(season.episodeCount - targetCount)
    if (!best || diff < best.diff) best = { seasonNumber: season.seasonNumber, diff }
  }
  return best?.seasonNumber
}

// The '-s<n>' suffix, which is what TMDB's own episode ids already use ('94664-s3e1'). Keeping the
// media on the same convention means the two read as one id space rather than two.
const SEASON_SCOPED = /^(.+)-s(\d{1,3})$/

/** A show id scoped to one season. The only id shape a season-scoped media may carry. */
export const seasonScopedId = (id: string | number, seasonNumber: number) => `${id}-s${seasonNumber}`

/** Reverse of seasonScopedId: the show to ask for, and the season the uri pinned. */
export const splitSeasonScopedId = (id: string): { showId: string, seasonNumber?: number } => {
  const match = SEASON_SCOPED.exec(id)
  return match ? { showId: match[1]!, seasonNumber: Number(match[2]) } : { showId: id }
}
