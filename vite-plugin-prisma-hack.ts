import type { Plugin } from 'vite'

export function prismaBrowserHack(): Plugin {
  return {
    name: 'prisma-browser-hack',

    transform(code: string, id: string) {
      // if (id.includes('generated/package.json')) {
      //   code = `{
      //     "name": "prisma-client-generated",
      //     "main": "index.js",
      //     "types": "index.d.ts",
      //     "version": "6.13.0",
      //     "sideEffects": false
      //   }`
      // }
      // Patch @prisma/client files and generated files
      if (id.includes('@prisma/client') || id.includes('.prisma/client') || id.includes('prisma/generated')) {

        code = code.replace(
          /process\.pid/g,
          '(16160)'
        )

        code = code.replace(
          /__dirname/g,
          '""'
        )

        code = code.replace(
          /fs\.existsSync/g,
          `(() => false)`
        )

        code = code.replace(
          /(\w*)\.default\.existsSync/g,
          `(() => false)`
        )


        // Remove or bypass browser detection
        console.log('patching code', id)
//         code = code.replace(
//           /Object\.defineProperty\(exports, "__esModule", \{ value: true }\);/g,
//           ''
//         )

//         code = code.replace(
//           /\nexports\./g,
//           '\nexport const '
//         )

//         code = code.replace(
//           /export const Prisma = Prisma/g,
//           ''
//         )

//         code = code.replace(
//           /export const Prisma\./g,
//           'export const '
//         )

//         code = code.replace(
//           /export const PrismaClient = PrismaClient/g,
//           ''
//         )

//         code = code.replace(
//           /Object\.assign\(exports, Prisma\)/,
//           'export default Prisma'
//         )

//         code = code.replace(
// `const {
//   PrismaClientKnownRequestError,
//   PrismaClientUnknownRequestError,
//   PrismaClientRustPanicError,
//   PrismaClientInitializationError,
//   PrismaClientValidationError,
//   getPrismaClient,
//   sqltag,
//   empty,
//   join,
//   raw,
//   skip,
//   Decimal,
//   Debug,
//   objectEnumValues,
//   makeStrictEnum,
//   Extensions,
//   warnOnce,
//   defineDmmfProperty,
//   Public,
//   getRuntime,
//   createParam,
// } = require('./runtime/edge.js')`,
// `import {
//   PrismaClientKnownRequestError,
//   PrismaClientUnknownRequestError,
//   PrismaClientRustPanicError,
//   PrismaClientInitializationError,
//   PrismaClientValidationError,
//   getPrismaClient,
//   sqltag,
//   empty,
//   join,
//   raw,
//   skip,
//   Decimal,
//   Debug,
//   objectEnumValues,
//   makeStrictEnum,
//   Extensions,
//   warnOnce,
//   defineDmmfProperty,
//   Public,
//   getRuntime,
//   createParam,
// } from './runtime/edge.js'`
//         )

        // Pattern 2: Replace runtime checks that prevent browser execution
        code = code.replace(
          /throw\s+(?:new\s+)?Error\s*\(\s*['"`]PrismaClient is unable to run[^)]*\)/g,
          'console.warn("PrismaClient browser check bypassed")'
        )

        // Pattern 3: Replace checks for window/document
        code = code.replace(
          /typeof\s+window\s*!==?\s*["']undefined["']/g,
          'false'
        )

        // Pattern 4: Replace checks for process
        code = code.replace(
          /typeof\s+process\s*===?\s*["']undefined["']/g,
          'false'
        )

        // Pattern 5: Override getRuntime() to return node-like environment
        if (code.includes('getRuntime')) {
          code = code.replace(
            /function\s+getRuntime\s*\([^)]*\)\s*{[^}]+}/g,
            'function getRuntime() { return { id: "node", prettyName: "Node.js", isEdge: false } }'
          )

          // Also handle arrow function version
          code = code.replace(
            /(?:const|let|var)\s+getRuntime\s*=\s*\([^)]*\)\s*=>\s*{[^}]+}/g,
            'const getRuntime = () => ({ id: "node", prettyName: "Node.js", isEdge: false })'
          )
        }

        // Pattern 6: Replace environment detection functions
        code = code.replace(
          /globalThis\.Deno/g,
          'undefined'
        )

        code = code.replace(
          /globalThis\.Bun/g,
          'undefined'
        )

        code = code.replace(
          /globalThis\.EdgeRuntime/g,
          'undefined'
        )

        // Pattern 7: Force node detection
        code = code.replace(
          /\(globalThis\.process[^)]*\)\.release[^)]*name[^)]*===?\s*["']node["']/g,
          'true'
        )

        // Pattern 8: Replace the entire browser check logic
        const browserCheckPattern = /if\s*\([^)]*typeof\s+window[^)]*\)[^{]*{[^}]*PrismaClient\s+is\s+unable[^}]*}/g
        code = code.replace(browserCheckPattern, '{ /* Browser check removed */ }')

        // Pattern 9: Patch any remaining error throws related to browser
        code = code.replace(
          /throw[^;]*browser[^;]*;/gi,
          'console.warn("Browser error bypassed");'
        )

        // Pattern 10: Override the error getter if it exists
        if (code.includes('get(') && code.includes('PrismaClient is unable')) {
          code = code.replace(
            /get\s*\([^)]*\)\s*{[^}]*PrismaClient\s+is\s+unable[^}]*}/g,
            'get() { return null }'
          )
        }

        return {
          code,
          map: null
        }
      }

      return null
    },

    // Also handle HTML script tags
    transformIndexHtml(html) {
      // Add a script to set up environment before any other scripts
      const setupScript = `
        <script>
          // Set up Node-like environment for Prisma
          if (!window.process) {
            window.process = {
              env: { NODE_ENV: 'production' },
              platform: 'linux',
              version: 'v18.0.0',
              versions: { node: '18.0.0' }
            };
          }
          if (!window.global) {
            window.global = window;
          }
        </script>
      `

      // Insert after <head> tag
      return html.replace('<head>', '<head>' + setupScript)
    }
  }
}
