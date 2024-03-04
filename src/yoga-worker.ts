import type { ServerContext } from '../node_modules/scannarr'

import { makeScannarrServer, merge, groupRelatedHandles, makeScannarrHandle2 } from '../node_modules/scannarr'
import { targets } from 'laserr'
import { call, makeCallListener, registerListener } from 'osra'

import type { Resolvers as ParentResolvers } from './urql'
import { HandleRelation, Media } from './generated/graphql'

const recursiveRemoveNullable = (obj) =>
  Array.isArray(obj)
    ? obj.map(recursiveRemoveNullable)
    : (
      typeof obj === 'object'
        ? (
          Object
            .fromEntries(
              Object
                .entries(obj)
                .filter(([_, value]) => value !== null && value !== undefined)
                .map(([key, value]) => [key, recursiveRemoveNullable(value)])
            )
        )
        : obj
    )

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
      ...recursiveRemoveNullable(nodes),
      {
        handles: {
          edges: nodes.map(handle => ({
            handleRelationType: HandleRelation.Identical,
            node: handle
          })),
          nodes: nodes
        }
      }
    )

    if (nodes[0]?.__typename === 'Media') {
      const episodeNodes =
        (nodes as Media[])
          .flatMap((media) =>
            media
              .episodes
              ?.edges
              ?.map(edge => edge.node)
            ?? (
              media
                .episodes
                ?.nodes
            )
            ?? []
          )

      const { handleGroups } = groupRelatedHandles({
        results: episodeNodes
      })

      const scannarrHandles =
        handleGroups
          .map(handles =>
            makeScannarrHandle2({
              handles,
              mergeHandles
            })
          )

      return {
        ...result,
        episodes: {
          edges: scannarrHandles.map(episode => ({
            handleRelationType: HandleRelation.Identical,
            node: episode
          })),
          nodes: scannarrHandles
        }
      }
    }

    return result
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
