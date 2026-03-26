import type { ExtractorServerContext } from '../../extractor'
import type { Origin, Resolvers } from '../../../generated/schema/types.generated'

// @ts-expect-error
import _schema from './schema.gql?raw'
import { extractors } from '../../extractor'
import { findOrigin, findOrigins } from '../../store/db'
import { listenIterator } from '../../store/events'

export const schema = _schema as string

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    origin: {
      resolve: (parent: Origin) => parent,
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        if (!args.input.id) return

        const subscriptions = extractors.map(extractor =>
          extractor.client.subscription(
            ctx.params.query!,
            ctx.params.variables
          ).subscribe(() => {})
        )

        const origin = await findOrigin(args.input.id)
        if (origin) yield origin

        const originListener = listenIterator('origin:changed', { abortSignal: ctx.request.signal })

        try {
          for await (const _ of originListener) {
            const updatedOrigin = await findOrigin(args.input.id)
            if (updatedOrigin) yield updatedOrigin
          }
        } finally {
          await Promise.all(subscriptions.map(subscription => subscription.unsubscribe()))
          const finalOrigin = await findOrigin(args.input.id)
          if (finalOrigin) return yield finalOrigin
        }
      }
    },
    originPage: {
      resolve: (parent: Origin[]) => ({ nodes: parent }),
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        if (!args.input.ids || args.input.ids.length === 0) return

        const subscriptions = extractors.map(extractor =>
          extractor.client.subscription(
            ctx.params.query!,
            ctx.params.variables
          ).subscribe(() => {})
        )

        const filters = args.input.filters?.map(f => f as 'IS_API_ONLY' | 'IS_NOT_API_ONLY') ?? undefined

        yield await findOrigins(args.input.ids, filters)

        const originListener = listenIterator('origin:changed', { abortSignal: ctx.request.signal })

        try {
          for await (const _ of originListener) {
            yield await findOrigins(args.input.ids, filters)
          }
        } finally {
          await Promise.all(subscriptions.map(subscription => subscription.unsubscribe()))
          return yield await findOrigins(args.input.ids, filters)
        }
      }
    }
  },
  Origin: {
    id: (parent) => parent.id,
    url: (parent) => parent.url,
    name: (parent) => parent.name,
    icon: (parent) => parent.icon,
    color: (parent) => parent.color,
    isApiOnly: (parent) => parent.isApiOnly
  }
} satisfies Resolvers
