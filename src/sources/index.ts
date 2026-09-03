export * as jikan from './jikan/extractor'
export * as anilist from './anilist/extractor'
export * as anizip from './anizip/extractor'
export * as crunchyroll from './crunchyroll/extractor'
export * as unogs from './unogs/extractor'
export * as justwatch from './justwatch/extractor'
export * as appletv from './appletv/extractor'
export * as paramount from './paramount/extractor'
export * as disney from './disney/extractor'
export * as amazon from './amazon/extractor'
export * as hulu from './hulu/extractor'
export * as peacock from './peacock/extractor'
export * as hbo from './hbo/extractor'
export * as fubo from './fubo/extractor'
export * as tmdb from './tmdb/extractor'
export * as tvmaze from './tvmaze/extractor'
export * as kitsu from './kitsu/extractor'
export * as omdb from './omdb/extractor'
export * as trakt from './trakt/extractor'
export * as simkl from './simkl/extractor'
export * as tvdb from './tvdb/extractor'
export * as offline from './offline/extractor'

// WATCHMODE IS DISABLED, 2026-09-04, and the code is kept rather than deleted because the reason is a
// design gap rather than a defect in it.
//
// Watchmode has no season concept anywhere in the file: its record is a show, its media id is a show,
// and every provider handle it minted (nf, hulu, disney, amazon, hbo) was therefore a show-level id.
// A handle is an identity claim, so each of those welds two runs of a show into one media, and
// `graph.link` has no inverse. Refusing them individually leaves the source minting only `imdb`, which
// `worker/store/db.ts` already declines to link, so it would have contributed nothing while still
// appearing in the key settings as though it were useful.
//
// The missing primitive is the one `db.ts` named for IMDb: there is no way to attach a handle for its
// LINK without asserting identity. A streaming availability source is exactly what that primitive is
// for, so re-export this the day it exists. `src/sources/watchmode/extractor.test.ts` still runs and
// still pins the id reading, so the source stays honest while it is unplugged.
