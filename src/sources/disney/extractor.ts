import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'

// Disney+ — no anonymous API. Native: Disney Streaming "global" GraphQL
// (disney.api.edge.bamgrid.com), BAMGRID device-grant + email/password login + switchProfile.
// Ref: https://github.com/pam-param-pam/Disney-Plus-api-wrapper
// TODO: implement native fetch behind the web-extension session tunnel + FKN permission system.
// For now: metadata/episodes via TMDB, deep link via JustWatch.

export const icon = 'https://www.disneyplus.com/favicon.ico'
export const originUrl = 'https://www.disneyplus.com'
export const categories = ['SERIES', 'MOVIE'] as const
export const name = 'Disney+'
export const origin = 'disney'
export const official = false
export const metadataOnly = true
export const isApiOnly = false
export const supportedUris = ['disney']
export const color = '#0063e5'

export const resolvers: Resolvers = {
  Subscription: {
    media: { subscribe: async function* () { yield { media: null } } },
    mediaPage: {
      resolve: (parent: { mediaPage: { nodes: GQLMedia[] } }) => parent.mediaPage,
      subscribe: async function* () { yield { mediaPage: { nodes: [] } } }
    }
  }
}
