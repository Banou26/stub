// Same reason as ./videojs-css.d.ts: a side-effect CSS import has no type, so TS2882 fails the
// typecheck for a line the bundler handles fine. `@xyflow/react` ships its layout and transform
// rules in this file and the graph does not render correctly without it.
declare module '@xyflow/react/dist/style.css'
