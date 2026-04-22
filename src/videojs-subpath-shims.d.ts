// TypeScript's `moduleResolution: "node"` (the classic Node resolver)
// doesn't read the `exports` field in a package's `package.json`, so
// subpath imports like `@videojs/core/dom` and `@videojs/react/video`
// can't be resolved — even though Vite resolves them fine at runtime.
// These aliases point TypeScript at the matching internal paths so the
// types come through without having to switch the whole project to
// `moduleResolution: "bundler"`.

declare module '@videojs/core/dom' {
  export * from '@videojs/core/dist/dev/dom'
}

declare module '@videojs/react/video' {
  export * from '@videojs/react/dist/dev/presets/video'
}
