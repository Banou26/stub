import type { YogaInitialContext } from 'graphql-yoga'
import type { Resolvers as MainThreadResolvers } from '../worker'

import { useDeferStream } from '@graphql-yoga/plugin-defer-stream'
import { createSchema, createYoga, useErrorHandler, useExecutionCancellation } from 'graphql-yoga'
import { expose } from 'osra'

import { typeDefs } from '../generated/schema/typeDefs.generated'
import { resolvers } from './resolvers'

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
  HANDLE_REQUEST: async (input: RequestInfo | URL, init?: RequestInit) => {
    const { headers, body, method } = init ?? {}
    const response = await yoga.handleRequest(new Request(input, { headers, body, method }), {})
    return {
      headers: Object.fromEntries(response.headers.entries()),
      body: response.body
    }
  }
}

export type Resolvers = typeof osraResolvers

expose<MainThreadResolvers>(
  osraResolvers,
  {
    local: globalThis as unknown as Worker,
    remote: globalThis as unknown as Worker,
    key: 'yoga'
  }
)
