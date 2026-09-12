/**
 * The per-origin tables `plugin:profile` reads when a source declares nothing (5.4 P0).
 *
 * ONE FILE for all of them, because each is a CONSTANT STANDING IN FOR A PER-CLAIM PROPERTY: the
 * declared fields of 4.6 (`startDatePrecision`, `episodeCountKind`, `episodeNumberSpace`, and
 * `PluginSourceMeta`'s `countKind`, `folding`, `retranslates`, `showLevel`) are what eventually
 * replace them, one source at a time, and a table that is scattered cannot be retired. The failure
 * mode of a wrong entry is stated in 5.4 P0: it is one line here, and a full pass recomputes every
 * dependent plugin.
 *
 * READ ORDER, and it matters: a field the row itself declares wins, then the table below, then the
 * default. An origin in neither table, which is every remote plugin source today, counts a list
 * (`listLength`): the nyaa plugin counted 120 releases as the episodes of a twelve episode run
 * (2026-09-09), which is what a declared `countKind` exists to stop.
 *
 * Every token here is the origin as the extractor stamps it, not the directory it lives in:
 * crunchyroll is `cr`, justwatch is `jw`, unogs is `nf`, jikan is `mal`.
 */

/**
 * Origins whose every id names a CONTAINER, so the effective scope is CONTAINER before any answer.
 *
 * `imdb` (`db.ts:42`), `trakt` (`trakt/extractor.ts:95`), `tvdb` (`tvdb/extractor.ts:96,113`) and
 * `paramount` (`paramount/extractor.ts:54`). NOT omdb and NOT watchmode, which both mint a RUN for a
 * film (`omdb/extractor.ts:47`, `watchmode/extractor.ts:181-184`), so adding either here would stamp
 * every film they answer as a container.
 */
export const SHOW_LEVEL_ORIGINS = new Set(['imdb', 'trakt', 'tvdb', 'paramount'])

/**
 * Origins that fold cours into seasons, so one of their season rows can hold two of our runs.
 *
 * `crunchyroll/extractor.ts:379-384`, `unogs/extractor.ts:337-340`, `justwatch/extractor.ts:408-414`.
 * Read by the count guards of 5.2 (7 and 8), which land in step 2b.
 */
export const FOLDING_ORIGINS = new Set(['cr', 'nf', 'jw'])

/**
 * Origins that commission their own episode titles rather than republishing the broadcaster's.
 *
 * Netflix only, and measured: 4 exact matches of 25, with the best WRONG pair at 0.5463 sitting above
 * its true pair at 0.4537 (2026-09-10). JustWatch republishing provider titles is unmeasured and is
 * deliberately not flagged here, because a guess in this table is a guess in every rule that reads it.
 */
export const RETRANSLATING_ORIGINS = new Set(['nf'])

/**
 * Origins whose `episodeCount` is a figure the source PUBLISHES rather than the length of a list it
 * fetched.
 *
 * mal `data.episodes`, anilist `episodes`, anizip `episodeCount`, offline `record.ep`, omdb (a single
 * season or a film), justwatch `totalEpisodeCount`. A Crunchyroll SEARCH row's
 * `series_metadata.episode_count` is also a published figure while Crunchyroll's own list is a length,
 * and that distinction is per answer rather than per origin: `cr` sits in the list-length table below
 * and a declared `episodeCountKind` is what separates the two (4.6).
 */
export const DECLARED_COUNT_ORIGINS = new Set(['mal', 'anilist', 'anizip', 'offline', 'omdb', 'jw'])

/**
 * Origins whose `episodeCount` is the length of the list they fetched.
 *
 * crunchyroll (`fuzzy-merge.ts:274`), unogs (`:296`), appletv, tmdb, tvmaze, kitsu (overwritten by its
 * own list at `kitsu/extractor.ts:216`), simkl, trakt, tvdb, paramount. An empty list is `none` and
 * never 0, which is the rule that kept `foldVetoed` from refusing every candidate season (2026-09-09).
 */
export const LIST_LENGTH_ORIGINS = new Set([
  'cr', 'nf', 'appletv', 'tmdb', 'tvmaze', 'kitsu', 'simkl', 'trakt', 'tvdb', 'paramount',
])

/**
 * The numbering space an origin's episode numbers live in (5.4 P0, `EpisodeProfile.numberSpace`).
 *
 * `entry` is anizip's map key (`anizip/extractor.ts:78-96`) and `position` is unogs's list index
 * (`unogs/extractor.ts:294,500`). Every other origin numbers within a season, which is the default a
 * caller applies when this table is silent, and a declared `episodeNumberSpace` overrides both.
 */
export const NUMBER_SPACE_ORIGINS: Record<string, 'entry' | 'position'> = { anizip: 'entry', nf: 'position' }

/**
 * Origins KNOWN to build a start date out of a bare year or a bare month, kept as the record of who
 * coerces rather than as a gate.
 *
 * The date rule of 5.4 P0 is deliberately origin-independent: a parsed `startDate` whose UTC
 * day-of-month is 1 reads as `month-or-year` for EVERY origin until that origin declares
 * `startDatePrecision`, because AniList emits `toUTCString()` for every branch including its year-only
 * coercion (`aired-date.ts:33,44,50`) and jikan an offset-bearing ISO string, so a shape test admits
 * both coerced dates to the 45 day veto. Seven extractors template a year followed by `-01-01`
 * (`justwatch:387`, `omdb:55`, `tmdb:120`, `tvdb:99`, `unogs:166` and `:181`, `crunchyroll:152`) and
 * two answer `YYYY-MM-01` when only the month is known (`kitsu:135`, `jikan:126`).
 *
 * So nothing reads this table to DECIDE anything. It is the list the profile's own test walks, so the
 * rule is proven to fire for each of them rather than for the one origin a fixture happened to use.
 */
export const COERCING_ORIGINS = new Set(['jw', 'omdb', 'tmdb', 'tvdb', 'nf', 'cr', 'kitsu', 'mal'])
