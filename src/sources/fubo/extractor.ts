import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'

// Fubo - link-out only, permanently. No VOD search/episode API, and api.fubo.tv hard-blocks datacenter/VPN IPs. Availability badge (JustWatch) + TMDB metadata only.

export const icon = 'https://www.fubo.tv/favicon.ico'
export const originUrl = 'https://www.fubo.tv'
export const categories = ['SERIES', 'MOVIE'] as const
export const name = 'Fubo'
export const origin = 'fubo'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['fubo']
export const color = '#fa4616'

export const resolvers: Resolvers = {
  Subscription: {
    media: { subscribe: async function* () { yield { media: null } } },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* () { yield { mediaPage: { nodes: [] } } }
    }
  }
}
