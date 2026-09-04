import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'

// IMDb, and it deliberately answers NOTHING.
//
// It exists so that an `imdb:tt...` handle has an ORIGIN to be rendered against. Five sources mint one
// (jikan, omdb, simkl, trakt, watchmode) and the handle reaches the client correctly, but the UI builds
// its source rows from `originPage`, which lists registered origins. With no origin declaring
// `origin = 'imdb'` there was no name, no icon and no row, so the link was carried the whole way and
// dropped one line short of the screen.
//
// It will never resolve a media, and that is not a gap to be filled later. An IMDb `tt` id names the
// SHOW and IMDb models no seasons, so there is no season-level id to ask it about: `worker/store/db.ts`
// keeps imdb in `SHOW_LEVEL_ORIGINS` for exactly that reason and demotes every imdb handle to PART_OF.
// A resolver here would have to answer a show-level id with something, and everything it could answer
// is the defect that Set exists to prevent.
//
// `metadataOnly` keeps it out of the playback paths; `isApiOnly` false is what lets `originPage`'s
// IsNotApiOnly filter return it, which is the whole point of the file.

export const icon = 'https://www.imdb.com/favicon.ico'
export const originUrl = 'https://www.imdb.com'
export const categories = ['SERIES', 'MOVIE'] as const
export const name = 'IMDb'
export const origin = 'imdb'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['imdb']
export const color = '#f5c518'

export const resolvers: Resolvers = {
  Subscription: {
    media: { subscribe: async function* () { yield { media: null } } },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* () { yield { mediaPage: { nodes: [] } } }
    }
  }
}
