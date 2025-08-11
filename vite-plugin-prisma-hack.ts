import type { Plugin } from 'vite'

export const prismaBrowserHack = (): Plugin => ({
  name: 'prisma-browser-hack',

  transform(code: string, id: string) {
    if (id.includes('@prisma/client') || id.includes('prisma/generated')) {
      code = code.replace(
        /#wasm-compiler-loader/g,
        './wasm-worker-loader.mjs'
      )

      code = code.replace(
        /query_compiler_bg.wasm/g,
        'query_compiler_bg.wasm?init'
      )

      code = code.replace(
        /\(await loader\)\.default/g,
        `new WebAssembly.Module(await fetch('/prisma/generated/query_compiler_bg.wasm?url').then(res => res.arrayBuffer()))`
      )

      return { code }
    }
  }
})
