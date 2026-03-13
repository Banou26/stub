import type { ExtractorServerContext } from '../../extractor'
import type { Origin, Resolvers } from '../../../generated/schema/types.generated'

// @ts-expect-error
import _schema from './schema.gql?raw'
import { extractors } from '../../extractor'
import { findOrigin, findOrigins } from '../../drizzle/utils'
import { listenIterator } from '../../drizzle/notifications'

export const schema = _schema as string

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {
    origin: {
      resolve: (parent: Origin) => parent,
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        if (!args.input.id) return

        // Subscribe to extractors
        const subscriptions = extractors.map(extractor =>
          extractor.client.subscription(
            ctx.params.query!,
            ctx.params.variables
          ).subscribe(() => {})
        )

        // Initial yield
        const origin = await findOrigin(undefined, { id: args.input.id })
        if (origin) yield origin

        // Listen for changes
        const originListener = listenIterator({ table: 'origin', abortSignal: ctx.request.signal })

        try {
          for await (const _ of originListener) {
            const updatedOrigin = await findOrigin(undefined, { id: args.input.id })
            if (updatedOrigin) yield updatedOrigin
          }
        } finally {
          await Promise.all(subscriptions.map(subscription => subscription.unsubscribe()))
          const finalOrigin = await findOrigin(undefined, { id: args.input.id })
          if (finalOrigin) return yield finalOrigin
        }
      }
    },
    originPage: {
      resolve: (parent: Origin[]) => ({ nodes: parent }),
      subscribe: async function* (_parent, args, ctx: ExtractorServerContext) {
        if (!args.input.ids || args.input.ids.length === 0) return

        // Subscribe to extractors
        const subscriptions = extractors.map(extractor =>
          extractor.client.subscription(
            ctx.params.query!,
            ctx.params.variables
          ).subscribe(() => {})
        )

        // Initial yield
        yield await findOrigins(undefined, { ids: args.input.ids, filters: args.input.filters ?? undefined })

        // Listen for changes
        const originListener = listenIterator({ table: 'origin', abortSignal: ctx.request.signal })

        try {
          for await (const _ of originListener) {
            yield await findOrigins(undefined, { ids: args.input.ids, filters: args.input.filters ?? undefined })
          }
        } finally {
          await Promise.all(subscriptions.map(subscription => subscription.unsubscribe()))
          return yield await findOrigins(undefined, { ids: args.input.ids, filters: args.input.filters ?? undefined })
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
