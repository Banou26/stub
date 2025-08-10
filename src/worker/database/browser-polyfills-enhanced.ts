// Enhanced browser polyfills for Prisma Client
// These polyfills comprehensively mock Node.js environment to bypass Prisma's browser detection

// First, save references to browser indicators before Prisma loads
const originalWindow = typeof window !== 'undefined' ? window : undefined
const originalDocument = typeof document !== 'undefined' ? document : undefined
const originalNavigator = typeof navigator !== 'undefined' ? navigator : undefined

// Temporarily hide browser globals during Prisma initialization
// Use Object.defineProperty to override read-only properties
if (typeof globalThis !== 'undefined') {
  try {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true
    });
  } catch (e) {
    // Ignore if we can't override
  }
  
  try {
    Object.defineProperty(globalThis, 'document', {
      value: undefined,
      configurable: true,
      writable: true
    });
  } catch (e) {
    // Ignore if we can't override
  }
  
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
      writable: true
    });
  } catch (e) {
    // Ignore if we can't override
  }
}

// Comprehensive process polyfill
if (typeof globalThis.process === 'undefined') {
  const hrtime = {
    bigint: () => BigInt(Date.now() * 1000000)
  };
  
  globalThis.process = {
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: 'file:./dev.db',
      PRISMA_HIDE_UPDATE_MESSAGE: 'true',
      DEBUG: '',
    },
    platform: 'linux', // Don't use 'browser'
    arch: 'x64',
    version: 'v18.0.0',
    versions: {
      node: '18.0.0',
      v8: '10.0.0',
      modules: '108',
      openssl: '1.1.1',
    },
    cwd: () => '/',
    chdir: () => {},
    umask: () => 0,
    hrtime,
    nextTick: (callback: Function, ...args: any[]) => {
      Promise.resolve().then(() => callback(...args));
    },
    exit: (code?: number) => {
      console.warn(`process.exit(${code}) called in browser environment`);
    },
    pid: 1,
    ppid: 0,
    stdout: {
      write: (str: string) => console.log(str),
      isTTY: false,
    },
    stderr: {
      write: (str: string) => console.error(str),
      isTTY: false,
    },
    stdin: {
      read: () => null,
      isTTY: false,
    },
    argv: ['/usr/local/bin/node', '/app/index.js'],
    execPath: '/usr/local/bin/node',
    debugPort: 9229,
    abort: () => {
      throw new Error('process.abort() called');
    },
    kill: () => true,
    memoryUsage: () => ({
      rss: 1000000,
      heapTotal: 1000000,
      heapUsed: 500000,
      external: 100000,
      arrayBuffers: 50000
    }),
    uptime: () => Date.now() / 1000,
  } as any;
}

// Enhanced Buffer polyfill
if (typeof globalThis.Buffer === 'undefined') {
  class BufferPolyfill extends Uint8Array {
    static poolSize = 8192;
    
    static isBuffer(obj: any): boolean {
      return obj instanceof BufferPolyfill || obj instanceof Uint8Array;
    }

    static isEncoding(encoding: string): boolean {
      return ['utf8', 'utf-8', 'hex', 'base64', 'ascii', 'binary', 'latin1'].includes(encoding.toLowerCase());
    }

    static from(data: any, encoding?: string): BufferPolyfill {
      if (typeof data === 'string') {
        const encoder = new TextEncoder();
        return new BufferPolyfill(encoder.encode(data));
      }
      if (data instanceof ArrayBuffer) {
        return new BufferPolyfill(data);
      }
      if (data instanceof Uint8Array) {
        return new BufferPolyfill(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      }
      if (Array.isArray(data)) {
        return new BufferPolyfill(new Uint8Array(data));
      }
      if (data && typeof data === 'object' && 'type' in data && data.type === 'Buffer' && Array.isArray(data.data)) {
        return new BufferPolyfill(new Uint8Array(data.data));
      }
      throw new Error('Unsupported data type for Buffer.from');
    }

    static concat(buffers: Uint8Array[], totalLength?: number): BufferPolyfill {
      const length = totalLength ?? buffers.reduce((sum, buf) => sum + buf.length, 0);
      const result = new Uint8Array(length);
      let offset = 0;
      for (const buf of buffers) {
        result.set(buf, offset);
        offset += buf.length;
        if (offset >= length) break;
      }
      return new BufferPolyfill(result.buffer.slice(0, offset));
    }

    static alloc(size: number, fill?: any, encoding?: string): BufferPolyfill {
      const buf = new BufferPolyfill(new Uint8Array(size));
      if (fill !== undefined) {
        buf.fill(fill);
      }
      return buf;
    }

    static allocUnsafe(size: number): BufferPolyfill {
      return new BufferPolyfill(new Uint8Array(size));
    }

    static byteLength(string: string, encoding?: string): number {
      return new TextEncoder().encode(string).length;
    }

    static compare(buf1: Uint8Array, buf2: Uint8Array): number {
      const len = Math.min(buf1.length, buf2.length);
      for (let i = 0; i < len; i++) {
        if (buf1[i] < buf2[i]) return -1;
        if (buf1[i] > buf2[i]) return 1;
      }
      if (buf1.length < buf2.length) return -1;
      if (buf1.length > buf2.length) return 1;
      return 0;
    }

    toString(encoding?: string, start?: number, end?: number): string {
      const bytes = this.slice(start, end);
      if (encoding === 'hex') {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      }
      if (encoding === 'base64') {
        const binary = String.fromCharCode(...bytes);
        return btoa(binary);
      }
      const decoder = new TextDecoder();
      return decoder.decode(bytes);
    }

    toJSON() {
      return {
        type: 'Buffer',
        data: Array.from(this),
      };
    }

    equals(other: Uint8Array): boolean {
      if (this.length !== other.length) return false;
      for (let i = 0; i < this.length; i++) {
        if (this[i] !== other[i]) return false;
      }
      return true;
    }

    compare(target: Uint8Array): number {
      return BufferPolyfill.compare(this, target);
    }

    copy(target: Uint8Array, targetStart = 0, sourceStart = 0, sourceEnd = this.length): number {
      const len = Math.min(sourceEnd - sourceStart, target.length - targetStart);
      target.set(this.subarray(sourceStart, sourceStart + len), targetStart);
      return len;
    }

    slice(start?: number, end?: number): BufferPolyfill {
      return new BufferPolyfill(super.slice(start, end));
    }

    subarray(start?: number, end?: number): BufferPolyfill {
      return new BufferPolyfill(super.subarray(start, end));
    }

    write(string: string, offset = 0, length?: number, encoding = 'utf8'): number {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(string);
      const len = length ?? bytes.length;
      const actualLen = Math.min(len, this.length - offset);
      this.set(bytes.subarray(0, actualLen), offset);
      return actualLen;
    }

    fill(value: any, offset = 0, end = this.length): this {
      if (typeof value === 'string') {
        value = value.charCodeAt(0);
      }
      for (let i = offset; i < end; i++) {
        this[i] = value;
      }
      return this;
    }
  }

  globalThis.Buffer = BufferPolyfill as any;
}

// Comprehensive fs module polyfill
if (typeof globalThis.fs === 'undefined') {
  const memoryFS: { [key: string]: any } = {};
  
  globalThis.fs = {
    existsSync: (path: string) => {
      // Prisma might check for schema files
      if (path.includes('schema.prisma')) return true;
      return path in memoryFS;
    },
    readFileSync: (path: string, options?: any) => {
      if (path.includes('schema.prisma')) {
        // Return a minimal schema that Prisma might expect
        return Buffer.from('');
      }
      if (path in memoryFS) {
        return memoryFS[path];
      }
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    },
    writeFileSync: (path: string, data: any) => {
      memoryFS[path] = data;
    },
    mkdirSync: (path: string) => {
      memoryFS[path] = {};
    },
    statSync: (path: string) => ({
      isFile: () => !path.endsWith('/'),
      isDirectory: () => path.endsWith('/'),
      size: 0,
      mtime: new Date(),
    }),
    readdirSync: (path: string) => {
      return Object.keys(memoryFS).filter(p => p.startsWith(path));
    },
    promises: {
      readFile: async (path: string) => {
        if (path in memoryFS) {
          return memoryFS[path];
        }
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      },
      writeFile: async (path: string, data: any) => {
        memoryFS[path] = data;
      },
      mkdir: async (path: string) => {
        memoryFS[path] = {};
      },
      stat: async (path: string) => ({
        isFile: () => !path.endsWith('/'),
        isDirectory: () => path.endsWith('/'),
        size: 0,
        mtime: new Date(),
      }),
    },
  } as any;
}

// Enhanced path module polyfill
if (typeof globalThis.path === 'undefined') {
  const sep = '/';
  
  globalThis.path = {
    sep,
    delimiter: ':',
    join: (...parts: string[]) => {
      return parts.filter(Boolean).join(sep).replace(/\/+/g, sep);
    },
    resolve: (...parts: string[]) => {
      const resolved = parts.filter(Boolean).join(sep).replace(/\/+/g, sep);
      return resolved.startsWith(sep) ? resolved : sep + resolved;
    },
    dirname: (path: string) => {
      const parts = path.split(sep);
      parts.pop();
      return parts.join(sep) || sep;
    },
    basename: (path: string, ext?: string) => {
      const base = path.split(sep).pop() || '';
      if (ext && base.endsWith(ext)) {
        return base.slice(0, -ext.length);
      }
      return base;
    },
    extname: (path: string) => {
      const basename = path.split(sep).pop() || '';
      const dotIndex = basename.lastIndexOf('.');
      return dotIndex > 0 ? basename.slice(dotIndex) : '';
    },
    relative: (from: string, to: string) => {
      // Simplified relative path calculation
      const fromParts = from.split(sep).filter(Boolean);
      const toParts = to.split(sep).filter(Boolean);
      
      let i = 0;
      while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
        i++;
      }
      
      const up = '../'.repeat(fromParts.length - i);
      const down = toParts.slice(i).join(sep);
      
      return up + down;
    },
    isAbsolute: (path: string) => path.startsWith(sep),
    normalize: (path: string) => {
      const parts = path.split(sep);
      const result: string[] = [];
      
      for (const part of parts) {
        if (part === '..') {
          result.pop();
        } else if (part && part !== '.') {
          result.push(part);
        }
      }
      
      return (path.startsWith(sep) ? sep : '') + result.join(sep);
    },
    parse: (path: string) => {
      const dir = globalThis.path.dirname(path);
      const base = globalThis.path.basename(path);
      const ext = globalThis.path.extname(path);
      const name = base.slice(0, base.length - ext.length);
      
      return { root: sep, dir, base, ext, name };
    },
    format: (pathObject: any) => {
      const { dir, base } = pathObject;
      return dir ? globalThis.path.join(dir, base) : base;
    },
  } as any;
}

// os module polyfill
if (typeof globalThis.os === 'undefined') {
  globalThis.os = {
    platform: () => 'linux',
    arch: () => 'x64',
    release: () => '5.10.0',
    type: () => 'Linux',
    hostname: () => 'localhost',
    homedir: () => '/home/user',
    tmpdir: () => '/tmp',
    cpus: () => [{ model: 'Intel', speed: 2400 }],
    totalmem: () => 8000000000,
    freemem: () => 4000000000,
    uptime: () => Date.now() / 1000,
    networkInterfaces: () => ({}),
    EOL: '\n',
  } as any;
}

// crypto module polyfill
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.randomUUID) {
  const webCrypto = globalThis.crypto || {};
  
  if (!webCrypto.randomUUID) {
    webCrypto.randomUUID = () => {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      
      const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    };
  }
  
  webCrypto.randomBytes = (size: number) => {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes);
  };
  
  globalThis.crypto = webCrypto as any;
}

// util module polyfill
if (typeof globalThis.util === 'undefined') {
  globalThis.util = {
    promisify: (fn: Function) => {
      return (...args: any[]) => {
        return new Promise((resolve, reject) => {
          fn(...args, (err: any, result: any) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      };
    },
    inspect: (obj: any) => JSON.stringify(obj, null, 2),
    format: (f: string, ...args: any[]) => {
      let i = 0;
      return f.replace(/%s/g, () => String(args[i++]));
    },
    inherits: (ctor: any, superCtor: any) => {
      Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
    },
  } as any;
}

// events module polyfill
if (typeof globalThis.events === 'undefined') {
  class EventEmitter {
    private events: { [key: string]: Function[] } = {};
    
    on(event: string, listener: Function): this {
      if (!this.events[event]) {
        this.events[event] = [];
      }
      this.events[event].push(listener);
      return this;
    }
    
    emit(event: string, ...args: any[]): boolean {
      if (!this.events[event]) return false;
      this.events[event].forEach(listener => listener(...args));
      return true;
    }
    
    removeListener(event: string, listener: Function): this {
      if (!this.events[event]) return this;
      this.events[event] = this.events[event].filter(l => l !== listener);
      return this;
    }
    
    once(event: string, listener: Function): this {
      const onceListener = (...args: any[]) => {
        listener(...args);
        this.removeListener(event, onceListener);
      };
      return this.on(event, onceListener);
    }
  }
  
  globalThis.events = { EventEmitter } as any;
}

// stream module polyfill
if (typeof globalThis.stream === 'undefined') {
  globalThis.stream = {
    Readable: class Readable {},
    Writable: class Writable {},
    Transform: class Transform {},
    PassThrough: class PassThrough {},
  } as any;
}

// Export a function to restore browser globals after Prisma loads
export function restoreBrowserGlobals() {
  if (originalWindow) {
    try {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true
      });
    } catch (e) {
      (globalThis as any).window = originalWindow;
    }
  }
  if (originalDocument) {
    try {
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        configurable: true,
        writable: true
      });
    } catch (e) {
      (globalThis as any).document = originalDocument;
    }
  }
  if (originalNavigator) {
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true
      });
    } catch (e) {
      (globalThis as any).navigator = originalNavigator;
    }
  }
}

// Export a function to ensure polyfills are loaded
export function ensurePolyfills() {
  console.log('Enhanced browser polyfills for Prisma loaded');
}

// Auto-execute to ensure polyfills are available
ensurePolyfills();