import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'

// Max (HBO Max) - metadata/episodes via TMDB, deep link via JustWatch (provider 1899).

export const icon = 'https://www.max.com/favicon.ico'
export const originUrl = 'https://www.max.com'
export const categories = ['SERIES', 'MOVIE'] as const
export const name = 'Max'
export const origin = 'hbo'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['hbo']
export const color = '#7b5cff'

export const resolvers: Resolvers = {
  Subscription: {
    media: { subscribe: async function* () { yield { media: null } } },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* () { yield { mediaPage: { nodes: [] } } }
    }
  }
}
