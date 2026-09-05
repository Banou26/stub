import type { YogaInitialContext } from 'graphql-yoga'
import type { Resolvers as MainThreadResolvers } from '../worker'

import { useDeferStream } from '@graphql-yoga/plugin-defer-stream'
import { createSchema, createYoga, useErrorHandler, useExecutionCancellation } from 'graphql-yoga'
import { expose } from 'osra'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import { resolvers } from './resolvers'
import { extractors, setUserKeys, registerRemoteExtractor, unregisterRemoteExtractor, remotePicker, remotePlayer, selectRemoteRelease } from './extractor'
import { exportStore } from './store/export'

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
  registerRemoteSource: async (port: MessagePort, pluginUri: string): Promise<{ ok: { sources: { origin: string, name: string }[], rejected: { origin: string, reason: string }[] } } | { error: string }> => {
    try {
      return { ok: await registerRemoteExtractor(port, pluginUri) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  unregisterRemoteSource: (pluginUri: string) => unregisterRemoteExtractor(pluginUri),
  // the plugin origins are derived HERE rather than taken from the caller, so a caller cannot decline
  // to exclude them: a plugin's rows are that user's, never the product's.
  exportStore: (options?: { excludeOrigins?: string[], uris?: string[] }) =>
    exportStore({
      ...options,
      excludeOrigins: [
        ...(options?.excludeOrigins ?? []),
        ...extractors.filter(entry => entry.pluginUri).map(entry => entry.extractor.origin),
      ],
    }),
  remotePicker: (origin: string) => remotePicker(origin),
  remotePlayer: (origin: string) => remotePlayer(origin),
  selectRemoteRelease: (origin: string, uris: string[]) => selectRemoteRelease(origin, uris)
}

export type Resolvers = typeof osraResolvers

expose<MainThreadResolvers>(
  osraResolvers,
  {
    transport: globalThis,
    key: 'yoga'
  }
)
