import { expose } from 'osra'
import './prisma'
import './yoga'

export const resolvers = {
  HANDLE_REQUEST: async (request: { foo: string }) => {
    console.log('Handling request...')
    return undefined
  }
}

export type Resolvers = typeof resolvers

await expose<{}>(
  resolvers,
  { local: globalThis as unknown as Worker, remote: globalThis as unknown as Worker }
)
