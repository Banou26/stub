import type { KeyingConfig } from '@urql/exchange-graphcache'
import type { Exchange } from 'urql'

import type { Episode, Media, MediaBanner, MediaCover, MediaDescription, MediaShortDescription, MediaTitle, PlaybackSource } from './generated/schema/types.generated'

import { Client, fetchExchange } from 'urql'
import { devtoolsExchange } from '@urql/devtools'
import { cacheExchange } from '@urql/exchange-graphcache'

import { handleRequest } from './worker'
// @ts-expect-error
import introspection from './generated/graphql.schema.json'

export const keyResolvers = {
  Media: (media) => (media as Media).uri,
  MediaTitle: (mediaTitle) => `${(mediaTitle as MediaTitle).language}-${(mediaTitle as MediaTitle).title}`,
  MediaDescription: (mediaDescription) => `${(mediaDescription as MediaDescription).language}-${(mediaDescription as MediaDescription).description}`,
  MediaShortDescription: (mediaShortDescription) => `${(mediaShortDescription as MediaShortDescription).language}-${(mediaShortDescription as MediaShortDescription).description}`,
  MediaCover: (mediaCover) => `${(mediaCover as MediaCover).language}-${(mediaCover as MediaCover).url}`,
  MediaBanner: (mediaBanner) => `${(mediaBanner as MediaBanner).language}-${(mediaBanner as MediaBanner).url}`,
  Episode: (episode) => (episode as Episode).uri,
  PlaybackSource: (playbackSource) => (playbackSource as PlaybackSource).uri,
} satisfies KeyingConfig

const cache = cacheExchange({
  schema: introspection,
  keys: keyResolvers,
  resolvers: {

  }
})

const client = new Client({
  url: 'http://d/graphql',
  exchanges: [devtoolsExchange, cache as Exchange, fetchExchange],
  fetchSubscriptions: true,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const { body, headers } = await handleRequest(input, init)
    return new Response(body, { headers })
  }
})

const subscription = client.subscription(
  `
  subscription($input: MediaPageInput!) {
    mediaPage(input: $input) {
      nodes {
        uri
        titles {
          language
          title
        }
        descriptions {
          language
          description
        }
        shortDescriptions {
          language
          shortDescription
        }
        covers {
          language
          url
        }
        banners {
          language
          url
        }
      }
    }
  }`,
  {
    input: {
      status: 'RELEASING'
    }
  }
)
subscription.subscribe((result) => console.log('subscription result', result))

export default client
