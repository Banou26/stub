// Browser polyfills for Prisma Client
// These polyfills help Prisma Client work in browser environments

// Polyfill for process.env
if (typeof globalThis.process === 'undefined') {
  globalThis.process = {
    env: {
      NODE_ENV: 'production',
      // Add any other env vars Prisma might need
    },
    platform: 'browser',
    version: 'v16.0.0',
    versions: {
      node: '16.0.0',
    },
    cwd: () => '/',
    hrtime: {
      bigint: () => BigInt(Date.now() * 1000000),
    },
    // Add other process methods as needed
  } as any
}

// Polyfill for Buffer if not available
if (typeof globalThis.Buffer === 'undefined') {
  class BufferPolyfill extends Uint8Array {
    static isBuffer(obj: any): boolean {
      return obj instanceof Uint8Array
    }

    static from(data: any, encoding?: string): BufferPolyfill {
      if (typeof data === 'string') {
        const encoder = new TextEncoder()
        return new BufferPolyfill(encoder.encode(data))
      }
      if (data instanceof ArrayBuffer) {
        return new BufferPolyfill(data)
      }
      if (data instanceof Uint8Array) {
        return new BufferPolyfill(data)
      }
      if (Array.isArray(data)) {
        return new BufferPolyfill(new Uint8Array(data))
      }
      throw new Error('Unsupported data type for Buffer.from')
    }

    static concat(buffers: Uint8Array[]): BufferPolyfill {
      const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      for (const buf of buffers) {
        result.set(buf, offset)
        offset += buf.length
      }
      return new BufferPolyfill(result)
    }

    static alloc(size: number): BufferPolyfill {
      return new BufferPolyfill(new Uint8Array(size))
    }

    toString(encoding?: string): string {
      const decoder = new TextDecoder()
      return decoder.decode(this)
    }

    toJSON() {
      return {
        type: 'Buffer',
        data: Array.from(this),
      }
    }
  }

  globalThis.Buffer = BufferPolyfill as any
}

// Polyfill for fs module (minimal implementation for Prisma)
if (typeof globalThis.fs === 'undefined') {
  globalThis.fs = {
    existsSync: () => false,
    readFileSync: () => {
      throw new Error('File system not available in browser')
    },
    writeFileSync: () => {
      throw new Error('File system not available in browser')
    },
    promises: {
      readFile: async () => {
        throw new Error('File system not available in browser')
      },
      writeFile: async () => {
        throw new Error('File system not available in browser')
      },
    },
  } as any
}

// Polyfill for path module
if (typeof globalThis.path === 'undefined') {
  globalThis.path = {
    join: (...parts: string[]) => parts.join('/'),
    resolve: (...parts: string[]) => '/' + parts.join('/'),
    dirname: (path: string) => {
      const parts = path.split('/')
      parts.pop()
      return parts.join('/')
    },
    basename: (path: string) => {
      const parts = path.split('/')
      return parts[parts.length - 1]
    },
    extname: (path: string) => {
      const basename = path.split('/').pop() || ''
      const dotIndex = basename.lastIndexOf('.')
      return dotIndex > 0 ? basename.slice(dotIndex) : ''
    },
  } as any
}

// Polyfill for crypto module (using Web Crypto API)
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.randomUUID) {
  const webCrypto = globalThis.crypto || {}
  
  if (!webCrypto.randomUUID) {
    webCrypto.randomUUID = () => {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      
      // Set version (4) and variant bits
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      
      const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
    }
  }
  
  globalThis.crypto = webCrypto as any
}

// Export a function to ensure polyfills are loaded
export function ensurePolyfills() {
  // This function ensures all polyfills are loaded
  // It can be called at the start of your application
  console.log('Browser polyfills for Prisma loaded')
}

// Auto-execute to ensure polyfills are available
ensurePolyfills()