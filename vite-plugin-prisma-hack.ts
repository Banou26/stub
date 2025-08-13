import type { Plugin } from 'vite'

const pluginBase: Plugin = {
  name: 'prisma-browser-hack-worker',
  enforce: 'pre',
  transform(code: string, id: string) {
    if (id.includes('src/worker/prisma/generated/internal/class')) {
      const transformedCode = code.replace(
        /const \{ default: module } = await import\("\.\/query_compiler_bg\.wasm"\)/g,
        `const module = new WebAssembly.Module(await fetch((await import('./query_compiler_bg.wasm?url')).default).then(res => res.arrayBuffer()))`
      )
      return { code: transformedCode, map: null }
    }
    if (id.includes('wasm-compiler-edge')) {
      const transformedCode = code.replace(
        /SharedArrayBuffer/g,
        `class __DUMMY_CLASS__{}`
      )
      return { code: transformedCode, map: null }
    }
    return null
  }
}

export const prismaBrowserHack = (): Plugin => ({
  ...pluginBase,
  config() {
    return {
      worker: {
        plugins: () => [
          pluginBase
        ]
      }
    }
  }
})
