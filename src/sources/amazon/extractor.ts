import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'

// Prime Video - no anonymous API. For now: metadata/episodes via TMDB, deep link via JustWatch (imdbId).

export const icon = 'https://www.primevideo.com/favicon.ico'
export const originUrl = 'https://www.primevideo.com'
export const categories = ['SERIES', 'MOVIE'] as const
export const name = 'Prime Video'
export const origin = 'amazon'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['amazon']
export const color = '#00a8e1'

export const resolvers: Resolvers = {
  Subscription: {
    media: { subscribe: async function* () { yield { media: null } } },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* () { yield { mediaPage: { nodes: [] } } }
    }
  }
}
