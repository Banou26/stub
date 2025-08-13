import type { Plugin } from 'vite'

export const prismaBrowserHack = (): Plugin => ({
  name: 'prisma-browser-hack',
  enforce: 'pre',
  transform(code: string, id: string) {
    if (id.includes('src/worker/prisma/generated/internal/class')) {
      console.log('PRISMA HACK', id)
      code = code.replace(
        /const \{ default: module } = await import\("\.\/query_compiler_bg\.wasm\"\)/g,
        `const module = new WebAssembly.Module(await fetch((await import('./query_compiler_bg.wasm?url')).default).then(res => res.arrayBuffer()))`
      )
      return { code, map: null }
    }
    return null
  }
})
