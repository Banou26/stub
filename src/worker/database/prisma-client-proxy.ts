// Proxy-based approach to hack Prisma Client for browser usage
import './browser-polyfills-enhanced'
// @ts-ignore - Edge runtime Prisma Client
import * as PrismaEdge from '../../../prisma/generated'
// import { PrismaD1 } from '@prisma/adapter-d1'
// import { createWaSQLitePrismaAdapter } from './prisma-wa-sqlite-adapter'

console.log('PrismaEdge imported:', PrismaEdge)
const { PrismaClient } = PrismaEdge as any
console.log('PrismaClient extracted:', PrismaClient)

// Main function to get the Prisma client
export async function getPrismaClient(dbName: string = 'myDB'): Promise<PrismaClient> {
  // Import the adapter
  console.log('Importing PrismaClient adapter...')
  const { createWaSQLitePrismaAdapter } = await import('./prisma-wa-sqlite-adapter')
  // Create the wa-sqlite adapter
  console.log('Creating PrismaClient adapter...')
  const adapter = await createWaSQLitePrismaAdapter(dbName, (msg: string) => {
    console.log('[Prisma Debug]', msg)
  })
  console.log('Creating PrismaClient with adapter...')

  // const adapter = new PrismaD1({ CLOUDFLARE_ACCOUNT_ID: '', CLOUDFLARE_D1_TOKEN: '', CLOUDFLARE_DATABASE_ID: '' })
  const prismaClient = new PrismaClient({ adapter })

  // const prismaClient = new PrismaClient({
  //   // adapter,
  //   log: ['query', 'info', 'warn', 'error'],
  // })

  console.log('PrismaClient created successfully')
  return prismaClient
}
