import { mount, unmount } from './dom'

import { expect, test } from 'vitest'

import { ReactFlow } from '@xyflow/react'

/**
 * What `@xyflow/react` CAN and CANNOT do in this test environment, pinned so nobody rediscovers it.
 *
 * Two things had to be built for it to run here at all, and each failed by naming something else:
 *  - zustand 4, which xyflow depends on, imports "use-sync-external-store/shim/with-selector.js",
 *    a CommonJS file whose `require('react')` runs under node where no vite alias reaches it. It dies
 *    with "Cannot find module 'react'" before any assertion. tests/shims/ carries the replacement and
 *    vitest.config.ts points at it.
 *  - linkedom has no ResizeObserver and no animation frame timers. The first fails at render, the
 *    second only at UNMOUNT, which reads as a broken test rather than a missing global. ./dom.ts
 *    stubs both.
 *
 * THE LIMIT THIS FILE EXISTS FOR: nodes render and EDGES DO NOT. xyflow derives an edge from the
 * MEASURED boxes of its two handles, and linkedom is a DOM with no box model, so there is nothing to
 * measure and the edge is skipped. It is not a bug and not a version problem: the same graph in a
 * real headless Chrome draws the edge, measured 2026-09-13 as the path
 * `M75,40 C75,48.5 315,48.5 315,57` carrying its label.
 *
 * So an edge assertion written against a rendered graph here can NEVER pass, however correct the
 * code. Assert edges against `traceFlowGraph` (values) or against the `TraceEdge` component handed
 * its props (shape), which is what debug-trace.test.tsx does.
 */
const nodes = [
  { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' }, width: 100, height: 40 },
  { id: 'b', position: { x: 200, y: 0 }, data: { label: 'B' }, width: 100, height: 40 },
]
const edges = [{ id: 'e', source: 'a', target: 'b' }]

test('xyflow mounts under preact/compat and renders its nodes', () => {
  const host = mount(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlow nodes={nodes} edges={edges}/>
    </div>
  )

  expect(host.querySelectorAll('.react-flow__node').length, 'both nodes are drawn').toBe(2)
  expect(host.querySelector('[data-id="a"]'), 'and carry their ids').toBeTruthy()
  // the edge LAYER is there, which is what makes the next assertion a statement about measurement
  // rather than about the library being broken or the edge list being empty
  expect(host.querySelectorAll('.react-flow__edges').length).toBe(1)
  expect(
    host.querySelectorAll('.react-flow__edge').length,
    'no box model, so no edge: assert edges on traceFlowGraph or on TraceEdge instead'
  ).toBe(0)

  unmount(host)
})
