import type { YogaInitialContext } from 'graphql-yoga'
import type { Resolvers as MainThreadResolvers } from '../worker'

import { useDeferStream } from '@graphql-yoga/plugin-defer-stream'
import { createSchema, createYoga, useErrorHandler, useExecutionCancellation } from 'graphql-yoga'
import { expose } from 'osra'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import { resolvers } from './resolvers'
import { extractors, setUserKeys, registerRemoteExtractor, unregisterRemoteExtractor, remotePicker, remotePlayer, selectRemoteRelease } from './extractor'
import { exportStore } from './store/export'
import { enableGraph, exportAnswers, exportAsks, graphCounts } from './graph'

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
  // The page owns the `?graph` flag and hands it over once, right after spawning the worker.
  setGraphEnabled: (enabled: boolean) => enableGraph(enabled),
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
  exportStore: (options?: { excludeOrigins?: string[], passThroughOrigins?: string[], uris?: string[] }) =>
    exportStore({
      ...options,
      passThroughOrigins: options?.passThroughOrigins ?? [],
      excludeOrigins: [
        ...(options?.excludeOrigins ?? []),
        ...extractors.filter(entry => entry.pluginUri).map(entry => entry.extractor.origin),
      ],
    }),
  // The answer log has no options: it is the whole log, ordered by seq, and a caller that wants a
  // subset filters it. Unlike `exportStore` there is nothing to exclude, because a plugin source's
  // answers are rows about that user's own plugin and the export is the user's own.
  exportAnswers: () => exportAnswers(),
  // The questions the app's own consumer asked through `similarMedia`, ordered by seq. Beside the
  // answer log because they answer opposite halves of one question: the answers say what a source
  // returned, the asks say what was asked and refused, which is the only record of a source that
  // returned nothing (7.3).
  exportAsks: () => exportAsks(),
  // The row count of every table, which is what the ingest of 4.2 produced from that log. Beside the
  // log rather than derived from it by a caller: the two are read in one round trip from the same
  // flush, so a page cannot see answers the ingest has not written yet.
  graphCounts: () => graphCounts(),
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
