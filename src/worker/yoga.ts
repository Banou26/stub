import type { YogaInitialContext } from 'graphql-yoga'
import type { Resolvers as MainThreadResolvers } from '../worker'

import { useDeferStream } from '@graphql-yoga/plugin-defer-stream'
import { createSchema, createYoga, useErrorHandler, useExecutionCancellation } from 'graphql-yoga'
import { expose } from 'osra'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import { resolvers } from './resolvers'
import { setUserKeys, registerRemoteExtractor, unregisterRemoteExtractor } from './extractor'

export type ServerContext = YogaInitialContext & {

}

export type UserContext = {

}

export const schema = createSchema<Omit<ServerContext, keyof YogaInitialContext>>({
  typeDefs,
  resolvers
})

export const yoga = createYoga<Omit<ServerContext, keyof YogaInitialContext>, UserContext>({
  schema,
  maskedErrors: false,
  plugins: [
    useErrorHandler(({ errors, context }) => {
      for (const error of errors) {
        console.error(new Error(`GQLError occurred on request: ${context.operationName}`, { cause: error }))
      }
    }),
    useDeferStream(),
    useExecutionCancellation()
  ]
})

export const osraResolvers = {
  handleRequest: (input: RequestInfo | URL, init?: RequestInit) =>
    yoga.handleRequest(new Request(input, init), {}),
  setUserKeys: (keys: Record<string, string>) => setUserKeys(keys),
  // One end of a brokered FKN packages connection, transferred from the main thread. The worker
  // attaches osra on the port itself so plugin calls skip the main thread entirely.
  registerRemoteSource: async (port: MessagePort, pluginUri: string): Promise<{ ok: { origin: string, name: string } } | { error: string }> => {
    try {
      return { ok: await registerRemoteExtractor(port, pluginUri) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  unregisterRemoteSource: (pluginUri: string) => unregisterRemoteExtractor(pluginUri)
}

export type Resolvers = typeof osraResolvers

expose<MainThreadResolvers>(
  osraResolvers,
  {
    transport: globalThis,
    key: 'yoga'
  }
)
