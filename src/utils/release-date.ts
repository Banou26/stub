/**
 * An episode's release date, as a person reads it.
 *
 * Answers `undefined` for anything there is nothing honest to show for: no date, or a date written in
 * a shape nothing can parse. That is the caller's signal to render nothing rather than a dash or an
 * "unknown", since most episodes of most runs carry no date at all and a column of placeholders is
 * worse than an empty one.
 *
 * THE TRAP THIS EXISTS FOR is the day boundary. A source can name a DAY with no time (anizip's
 * `airdate` is `2024-01-07`), and `new Date('2024-01-07')` is midnight UTC, so `toLocaleDateString`
 * anywhere west of Greenwich renders **January 6**: every date-only episode shows a day early for a
 * third of the world, and nothing about it looks wrong. So a date-only value is formatted in UTC,
 * where the day the source named is the day shown, while a value carrying a time is a real moment and
 * is formatted where the viewer is.
 *
 * It cannot be seen from here, which is why it is pinned rather than eyeballed: this machine is UTC+9
 * and a positive offset never crosses backwards, so the wrong version and the right one render
 * identically on it. `tests/unit/utils/release-date.test.ts` pins the zone.
 *
 * A STRING is the whole input contract, because that is what reaches a client: `Episode.releaseDate`
 * is the GraphQL `Date` scalar. A source holding epoch milliseconds converts at the extractor, where
 * the units are established (see `src/sources/catalogue-gate.ts`, which records how Apple TV's were
 * measured), rather than here where a seconds-for-milliseconds mixup would be a silent 1970.
 */

/** `YYYY-MM-DD`, the one shape whose day means a day rather than an instant. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * A year no episode aired in, so a parsed `0000-01-01` is refused rather than rendered as "Jan 1, 0".
 * A floor rather than a window: an episode dated in the future is an announced one, which is worth
 * showing.
 */
const IMPLAUSIBLE_BEFORE = 1900

export type ReleaseDateOptions = {
  /** Left undefined in the app, so the viewer's own locale decides. Named so a test can pin one. */
  locale?: string | readonly string[]
}

/** The instant a value names, or `undefined` when it names none. */
export const parseReleaseDate = (value: string | null | undefined): Date | undefined => {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  // read in UTC, so the floor does not move with the viewer
  if (date.getUTCFullYear() < IMPLAUSIBLE_BEFORE) return undefined
  return date
}

/**
 * The date to show beside an episode, or `undefined` to show nothing.
 *
 * Deliberately a DAY and not a time. An episode's airing is a day in the viewer's head, the sources
 * disagree about the hour by whole timezones, and a broadcast minute in a listing is noise.
 */
export const releaseDateLabel = (
  value: string | null | undefined,
  { locale }: ReleaseDateOptions = {}
): string | undefined => {
  const date = parseReleaseDate(value)
  if (!date) return undefined
  try {
    return new Intl.DateTimeFormat(locale as string | string[] | undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      // the whole point: a named day is shown as that day, everywhere
      ...DATE_ONLY.test(value!) ? { timeZone: 'UTC' } : {},
    }).format(date)
  } catch {
    // an unusable locale must not take a row down over a date
    return undefined
  }
}

/**
 * The machine-readable value for a `<time dateTime>`, or `undefined` alongside an undefined label.
 *
 * A named day is handed back as that day rather than as an instant, so the attribute and the visible
 * text can never disagree about which day it is.
 */
export const releaseDateAttribute = (value: string | null | undefined): string | undefined => {
  const date = parseReleaseDate(value)
  if (!date) return undefined
  return DATE_ONLY.test(value!) ? value! : date.toISOString()
}
