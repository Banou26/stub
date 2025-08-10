// Proxy-based approach to hack Prisma Client for browser usage
import './browser-polyfills-enhanced'
// @ts-ignore - Edge runtime Prisma Client
import * as PrismaEdge from '../../../prisma/generated'

console.log('PrismaEdge imported:', PrismaEdge)
const { PrismaClient } = PrismaEdge as any
console.log('PrismaClient extracted:', PrismaClient)

// Main function to get the Prisma client
export async function getPrismaClient(dbName: string = 'myDB'): Promise<PrismaClient> {
  // Import the adapter
  const { createWaSQLitePrismaAdapter } = await import('./prisma-wa-sqlite-adapter')
  // Create the wa-sqlite adapter
  const adapter = await createWaSQLitePrismaAdapter(dbName, (msg: string) => {
    console.log('[Prisma Debug]', msg)
  })
  console.log('Creating PrismaClient with adapter...')

  const prismaClient = new PrismaClient({
    adapter,
    log: ['query', 'info', 'warn', 'error'],
  })

  console.log('PrismaClient created successfully')
  return prismaClient
}
