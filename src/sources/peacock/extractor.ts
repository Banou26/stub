import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'

// Peacock - no anonymous API. Native: NBC/Sky "atom" API, requires x-skyott-* headers +
// HMAC x-sky-signature + login + US. yt-dlp lists it DRM-blocked.
// TODO: implement native fetch behind the web-extension session tunnel + FKN permission system.
// For now: metadata/episodes via TMDB, deep link via JustWatch.

export const icon = 'https://www.peacocktv.com/favicon.ico'
export const originUrl = 'https://www.peacocktv.com'
export const categories = ['SERIES', 'MOVIE'] as const
export const name = 'Peacock'
export const origin = 'peacock'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['peacock']
export const color = '#069de0'

export const resolvers: Resolvers = {
  Subscription: {
    media: { subscribe: async function* () { yield { media: null } } },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* () { yield { mediaPage: { nodes: [] } } }
    }
  }
}
