// Proxy-based approach to hack Prisma Client for browser usage
import './browser-polyfills-enhanced'
import * as GeneratedPrisma from '../../../prisma/generated'
console.log('GeneratedPrisma', GeneratedPrisma)
// import { PrismaClient } from '../../../prisma/generated'

let prismaClient: PrismaClient | null = null

// Create a proxy handler that intercepts property access
function createPrismaProxy(target: any): any {
  return new Proxy(target, {
    get(obj, prop) {
      // Intercept error-throwing getters
      if (prop === 'then' || prop === 'catch') {
        return undefined // Prevent promise-like behavior that might trigger errors
      }

      try {
        const value = obj[prop]

        // If it's a function, wrap it to catch errors
        if (typeof value === 'function') {
          return function(...args: any[]) {
            try {
              const result = value.apply(obj, args)
              // Recursively proxy nested objects
              if (result && typeof result === 'object') {
                return createPrismaProxy(result)
              }
              return result
            } catch (error: any) {
              // Catch and suppress browser environment errors
              if (error.message && error.message.includes('browser environment')) {
                console.warn('Suppressed Prisma browser error:', error.message)
                // Return a mock that can be chained
                return createPrismaProxy({})
              }
              throw error
            }
          }
        }

        // Recursively proxy nested objects
        if (value && typeof value === 'object') {
          return createPrismaProxy(value)
        }

        return value
      } catch (error: any) {
        // Catch property access errors (like the browser check)
        if (error.message && error.message.includes('browser environment')) {
          console.warn('Suppressed Prisma browser error on property access:', prop)
          // Return undefined or a mock object
          return undefined
        }
        throw error
      }
    },

    set(obj, prop, value) {
      obj[prop] = value
      return true
    },

    has(obj, prop) {
      return prop in obj
    },

    construct(target, args) {
      const instance = new target(...args)
      return createPrismaProxy(instance)
    }
  })
}

// Patch the global Error constructor to intercept Prisma errors
const OriginalError = globalThis.Error
globalThis.Error = new Proxy(OriginalError, {
  construct(target, args) {
    const message = args[0]
    if (typeof message === 'string' && message.includes('PrismaClient is unable to run in this browser')) {
      console.warn('Intercepted Prisma browser error, returning mock error')
      // Return a harmless error that won't break the flow
      return new OriginalError('Prisma initialization in progress')
    }
    return new target(...args)
  }
}) as any

// Main function to get the Prisma client
export async function getPrismaClient(dbName: string = 'myDB'): Promise<PrismaClient> {
  if (prismaClient) {
    return prismaClient
  }

  // Import the adapter
  const { createWaSQLitePrismaAdapter } = await import('./prisma-wa-sqlite-adapter')

  // Create the wa-sqlite adapter
  const adapter = await createWaSQLitePrismaAdapter(dbName, (msg: string) => {
    console.log('[Prisma Debug]', msg)
  })

  console.log('try patched')
  const PatchedPrismaClient = new Proxy(PrismaClient, {
    construct(target, args) {
      const instance = new target(...args)
      return createPrismaProxy(instance)
    }
  })

  prismaClient = new PatchedPrismaClient({
    adapter,
    log: ['query', 'info', 'warn', 'error'],
  }) as PrismaClient
  console.log('using patched')
}
