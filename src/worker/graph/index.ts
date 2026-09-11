/**
 * The worker end of the `?graph` flag.
 *
 * A worker cannot read the page's query string, so `src/worker.ts` reads it and calls
 * `setGraphEnabled` over osra right after spawning. Off is the default and costs nothing: the engine
 * client is imported lazily, so with the flag down neither it nor the 22 MB engine is ever fetched.
 */
import { graphEnabled, openGraph, setGraphEnabled } from './engine'

export { closeGraph, graphEnabled, openGraph, setGraphEnabled } from './engine'
export type { Graph, GraphRow } from './engine'

let booting: Promise<void> | undefined

const boot = async () => {
  const started = performance.now()
  const { version } = await openGraph()
  console.info(`graph: engine ready in ${Math.round(performance.now() - started)} ms, version ${version}`)
}

/** Carries the page's flag in, and opens the engine once when it is on. */
export const enableGraph = (enabled: boolean): Promise<void> => {
  setGraphEnabled(enabled)
  if (!graphEnabled()) return Promise.resolve()
  return (booting ??= boot())
}
