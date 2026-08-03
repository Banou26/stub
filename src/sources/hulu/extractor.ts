import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'

// Hulu - no anonymous API. For now: metadata/episodes via TMDB, deep link via JustWatch.

export const icon = 'https://www.hulu.com/favicon.ico'
export const originUrl = 'https://www.hulu.com'
export const categories = ['SERIES', 'MOVIE'] as const
export const name = 'Hulu'
export const origin = 'hulu'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['hulu']
export const color = '#1ce783'

export const resolvers: Resolvers = {
  Subscription: {
    media: { subscribe: async function* () { yield { media: null } } },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* () { yield { mediaPage: { nodes: [] } } }
    }
  }
}
