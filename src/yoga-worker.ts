import type { ServerContext } from '../node_modules/scannarr'

import { makeScannarrServer, merge, groupRelatedHandles, makeScannarrHandle2 } from '../node_modules/scannarr'
import { targets } from '../node_modules/laserr'
import { call, makeCallListener, registerListener } from 'osra'

import type { Resolvers as ParentResolvers } from './urql'
import { HandleRelation, Media } from './generated/graphql'
import { RemoveNullable, recursiveRemoveNullable } from '../node_modules/scannarr/src/urql/__graph'

const target = call<ParentResolvers>(globalThis as unknown as Worker, { key: 'yoga-fetch' })
const { yoga } = makeScannarrServer({
  origins: targets,
  context: async () => ({
    fetch: async (input: RequestInfo | URL, init: RequestInit | undefined) => {
      const { body, ...rest } = await target(
        'YOGA_FETCH',
        {
          input: input.toString(),
          init: init && {
            ...init,
            method: init.method,
            headers: init.headers,
            body: init.body
          }
        }
      )
      return new Response(
        body,
        rest
      )
    }
  }) as ServerContext,
  mergeHandles: function mergeHandles(handles) {
    if (handles.length === 1) return handles[0]!

    const nodes =
      handles
        .sort((a, b) =>
          a.id.localeCompare(b.id)
        )

    const result = merge(
      ...recursiveRemoveNullable(nodes).filter(Boolean),
      {
        handles: nodes.filter(Boolean)
      }
    )
    const { handleGroups } = groupRelatedHandles({ results: handles })

    if (result.origin === 'scannarr') {
      const scannarrHandle = handleGroups[0].find(handle => handle.origin === 'scannarr')
      if (scannarrHandle) {
        handleGroups[0].splice(handleGroups[0].indexOf(scannarrHandle), 1)
      }
    }

    if (nodes[0]?.__typename === 'Media') {
      const episodeNodes =
        (nodes as Media[])
          .flatMap((media) => media.episodes ?? [])

      // const { handleGroups: episodeHandleGroups } = groupRelatedHandles({ results: episodeNodes })

      const groupEpisodesByEpisodeNumber = (episodes: Media[]) => {
        const episodesByEpisodeNumber = new Map<number, Media[]>()
        for (const episode of episodes) {
          if (!episodesByEpisodeNumber.has(episode.number)) {
            episodesByEpisodeNumber.set(episode.number, [])
          }
          episodesByEpisodeNumber.get(episode.number)?.push(episode)
        }
        return [...episodesByEpisodeNumber.values()]
      }

      const episodesByEpisodeNumber = groupEpisodesByEpisodeNumber(episodeNodes)

      const scannarrEpisodeHandles =
        episodesByEpisodeNumber
            .map(handles =>
              makeScannarrHandle2({
                handles,
                mergeHandles
              })
            )

      // console.log('scannarrEpisodeHandles', episodeNodes, scannarrEpisodeHandles, handles)

      return {
        ...result,
        handles: handleGroups[0],
        episodes: scannarrEpisodeHandles
      }
    }

    return {
      ...result,
      handles: handleGroups[0]
    }
  }
})

const resolvers = {
  HANDLE_REQUEST: makeCallListener(async ({ input, init }: { input: RequestInfo, init?: RequestInit }) => {
    const res = await yoga.handleRequest(new Request(input, init), {})
    return {
      ...res,
      body: res.body,
      headers: Object.fromEntries(res.headers.entries())
    }
  })
}

export type Resolvers = typeof resolvers

registerListener({
  target: globalThis as unknown as Worker,
  // @ts-ignore
  resolvers,
  key: 'yoga-server'
})
