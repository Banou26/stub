/**
 * `useSyncExternalStoreWithSelector` on top of preact/compat, for the TEST resolver only.
 *
 * WHY IT EXISTS. zustand 4, which `@xyflow/react` depends on, imports
 * "use-sync-external-store/shim/with-selector.js". That file is CommonJS and its `require('react')`
 * runs under node, where no vite alias can reach it, so a test rendering any xyflow component dies
 * with "Cannot find module 'react'" before a single assertion runs. vitest.config.ts already carries
 * the same workaround for the SIBLING path "shim/index.js", which it can point straight at
 * preact/compat because that entry exports exactly `useSyncExternalStore` and compat has it. This
 * entry exports `useSyncExternalStoreWithSelector`, which compat does NOT have, so the selector
 * layer is implemented here instead of aliased away.
 *
 * THE BROWSER BUILD NEEDS NONE OF THIS and deliberately does not use it: rolldown resolves the same
 * CJS file, converts it, and its `require('react')` becomes an import the alias does reach. Measured
 * 2026-09-13 by building a probe entry that imports ReactFlow: exit 0, 47 `react-flow__` strings in
 * the output. So this file is test infrastructure and must never be aliased into the shipping build,
 * where it would replace a maintained implementation with a copy of one.
 *
 * The algorithm is React's own, kept structurally identical so a future reader can diff it against
 * the upstream file rather than re-deriving why the memo is shaped this way. The point of the memo is
 * that `selector` runs on every store notification, so an unmemoised version re-renders whenever the
 * store changes at all, even when the selected slice did not.
 */
import { useMemo, useRef, useSyncExternalStore } from 'preact/compat'

type Selector<Snapshot, Selection> = (snapshot: Snapshot) => Selection
type IsEqual<Selection> = (a: Selection, b: Selection) => boolean

export const useSyncExternalStoreWithSelector = <Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot: (() => Snapshot) | undefined,
  selector: Selector<Snapshot, Selection>,
  isEqual?: IsEqual<Selection>,
): Selection => {
  // the previously SELECTED value, kept across renders so `isEqual` has a left hand side on the
  // first call after a change. A ref rather than state: writing it must never schedule a render.
  const instance = useRef<{ hasValue: boolean, value: Selection | null }>({ hasValue: false, value: null })

  const getSelection = useMemo(() => {
    let hasMemo = false
    let memoizedSnapshot: Snapshot
    let memoizedSelection: Selection

    const memoizedSelector = (nextSnapshot: Snapshot): Selection => {
      if (!hasMemo) {
        hasMemo = true
        memoizedSnapshot = nextSnapshot
        const firstSelection = selector(nextSnapshot)
        if (isEqual !== undefined && instance.current.hasValue) {
          const currentSelection = instance.current.value as Selection
          if (isEqual(currentSelection, firstSelection)) {
            memoizedSelection = currentSelection
            return currentSelection
          }
        }
        memoizedSelection = firstSelection
        return firstSelection
      }

      const previousSnapshot = memoizedSnapshot
      const previousSelection = memoizedSelection
      // Object.is, not ===, so a store that hands back the same NaN is not treated as a change
      if (Object.is(previousSnapshot, nextSnapshot)) return previousSelection

      const nextSelection = selector(nextSnapshot)
      if (isEqual !== undefined && isEqual(previousSelection, nextSelection)) {
        // the snapshot moved but the SLICE did not: advance the snapshot and keep the old reference,
        // which is the whole reason a caller passes an equality function
        memoizedSnapshot = nextSnapshot
        return previousSelection
      }

      memoizedSnapshot = nextSnapshot
      memoizedSelection = nextSelection
      return nextSelection
    }

    // The SERVER snapshot is deliberately dropped rather than threaded through: preact/compat's
    // `useSyncExternalStore` takes two arguments and has no third for it, and nothing in this app
    // server renders, so there is no second environment for it to differ in. It stays in the
    // signature because zustand passes it positionally and a shorter signature would silently take
    // the selector as the server snapshot.
    return () => memoizedSelector(getSnapshot())
  }, [getSnapshot, getServerSnapshot, selector, isEqual])

  const value = useSyncExternalStore(subscribe, getSelection)
  instance.current.hasValue = true
  instance.current.value = value
  return value
}

export default { useSyncExternalStoreWithSelector }
