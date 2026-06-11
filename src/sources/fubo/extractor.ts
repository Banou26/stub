import type { Resolvers, Media as GQLMedia } from '../../generated/schema/types.generated'

// Fubo - link-out only, permanently. No VOD search/episode API (yt-dlp = AdobePass MSO login only;
// streamlink = none; Kodi addon = live channels/EPG only), and api.fubo.tv hard-blocks datacenter/VPN
// IPs, so the cloud proxy physically can't reach it. Availability badge (JustWatch) + TMDB metadata only.
// Note: justwatch/extractor.ts extractContentId has no fubo.tv branch yet, so the Fubo handle has no
// stable content id - add `host === 'fubo.tv'` returning the series-slug if you want a resolvable handle.

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
