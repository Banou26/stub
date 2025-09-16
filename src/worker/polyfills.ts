// Worker polyfills for jsdom compatibility

// Create a global require function if it doesn't exist
if (typeof (globalThis as any).require === 'undefined') {
  (globalThis as any).require = function(moduleName: string) {
    // Handle XMLHttpRequest-related requires from jsdom
    if (moduleName === './xhr-utils' ||
        moduleName.includes('XMLHttpRequest') ||
        moduleName.includes('xmlhttprequest')) {

      // Return a mock implementation that jsdom expects
      return {
        XMLHttpRequestImpl: class XMLHttpRequestImpl extends XMLHttpRequest {
          constructor() {
            super()
          }
        },
        XMLHttpRequestUpload: class XMLHttpRequestUpload extends EventTarget {}
      }
    }

    // Handle other Node.js built-in modules
    const modules: Record<string, any> = {
      'http': {
        request: () => ({ on: () => {}, end: () => {}, write: () => {} }),
        get: () => ({ on: () => {}, end: () => {} })
      },
      'https': {
        request: () => ({ on: () => {}, end: () => {}, write: () => {} }),
        get: () => ({ on: () => {}, end: () => {} })
      },
      'url': {
        parse: (url: string) => new URL(url),
        format: (urlObj: any) => urlObj.toString()
      },
      'util': {
        inherits: () => {},
        promisify: (fn: Function) => fn,
        TextDecoder: TextDecoder,
        TextEncoder: TextEncoder
      },
      'stream': {
        Readable: class { on() {}; read() {} },
        Writable: class { on() {}; write() {} },
        PassThrough: class { on() {}; pipe() {} }
      },
      'events': {
        EventEmitter: class EventEmitter {
          on() { return this }
          once() { return this }
          off() { return this }
          emit() { return true }
          removeListener() { return this }
        }
      },
      'buffer': { Buffer: (globalThis as any).Buffer || Uint8Array },
      'path': {
        join: (...args: string[]) => args.join('/'),
        resolve: (...args: string[]) => '/' + args.filter(Boolean).join('/'),
        basename: (path: string) => path.split('/').pop() || '',
        dirname: (path: string) => path.split('/').slice(0, -1).join('/') || '/',
        extname: (path: string) => {
          const parts = path.split('.')
          return parts.length > 1 ? '.' + parts.pop() : ''
        }
      },
      'fs': {
        readFileSync: () => '',
        existsSync: () => false,
        readFile: (path: string, cb: Function) => cb(new Error('FS not available in browser'))
      },
      'crypto': {
        randomBytes: (size: number) => {
          const bytes = new Uint8Array(size)
          crypto.getRandomValues(bytes)
          return {
            toString: (encoding: string) => {
              if (encoding === 'hex') {
                return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
              }
              return btoa(String.fromCharCode(...bytes))
            }
          }
        }
      },
      'vm': {
        runInNewContext: (code: string) => eval(code)
      }
    }

    if (modules[moduleName]) {
      return modules[moduleName]
    }

    // Log unhandled modules for debugging
    console.warn(`Module "${moduleName}" requested but not available in worker polyfill`)
    return {}
  }

  // Also add module.exports support
  ;(globalThis as any).module = { exports: {} }
  ;(globalThis as any).exports = (globalThis as any).module.exports
}

// Ensure global is defined
if (typeof (globalThis as any).global === 'undefined') {
  (globalThis as any).global = globalThis
}

// Ensure process is defined
if (typeof (globalThis as any).process === 'undefined') {
  (globalThis as any).process = {
    env: {},
    version: 'v16.0.0',
    versions: { node: '16.0.0' },
    platform: 'browser',
    argv: [],
    cwd: () => '/',
    nextTick: (fn: Function) => Promise.resolve().then(() => fn())
  }
}

// Export to ensure the module is included
export {}