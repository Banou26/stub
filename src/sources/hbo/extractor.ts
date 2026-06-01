import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'

// Max (HBO Max) — metadata/episodes via TMDB, deep link via JustWatch (provider 1899).
// Optional native enrichment (US-egress): mint an ANONYMOUS token
//   POST https://comet.api.hbo.com/auth/tokens  { client_id/secret: 24fa5e36-3dc4-4ed0-b3f1-29909271b63d,
//     grant_type: client_credentials, scope: 'browse video_playback_free' }
// then POST https://comet.api.hbo.com/content with [{ id: 'urn:hbo:series:<id>' }] for season/episode URNs.
// Metadata works anonymously; only DRM playback needs login. Treat hardcoded client_id as a liability.
// TODO: wire the anonymous token path if you want native episode ids/stills.

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
