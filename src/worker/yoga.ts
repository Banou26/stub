import { useDeferStream } from '@graphql-yoga/plugin-defer-stream'
import { createYoga } from 'graphql-yoga'

const yoga = createYoga({
  schema,
  maskedErrors: false,
  plugins: [useDeferStream()]
})
