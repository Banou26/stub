import type { Edge, Node } from '@xyflow/react'

import type { TraceBundle, TraceLink } from './trace'
import type { PlacedTraceNode, TraceNodeKind } from './model'

import { edgeLanes, isActive, traceGraphLayout } from './model'

/**
 * The trace bundle as the two lists `@xyflow/react` draws: nodes at positions, edges between them.
 *
 * PURE, AND SEPARATE FROM THE COMPONENT ON PURPOSE. Everything this page asserts about its graph is a
 * question about THIS function: which uris became boxes, what shape each one is, which links became
 * edges, which of those are refused, and how two rows between the same pair are told apart. None of
 * that is a question about pixels, and asking it of the DOM was only ever a way of reaching it.
 *
 * It has to be separate because the component tests run under linkedom, which has no box model, and
 * `@xyflow/react` derives every edge from MEASURED handle boxes: with nothing to measure it renders
 * the nodes and draws no edges at all. Measured 2026-09-13, both ways, so this is a property of the
 * harness and not of the library: under linkedom, 2 nodes and 0 edges; the same graph in a real
 * headless Chrome, 2 nodes and 1 edge carrying the path `M75,40 C75,48.5 315,48.5 315,57` and its
 * label. `tests/unit/components/xyflow-env.test.tsx` pins exactly that split so the next reader does
 * not rediscover it by writing an edge assertion that can never pass.
 *
 * So the edge cases live here, where they are stronger than they were in the DOM: a lane, a status
 * and a reason are checked as values rather than as class names, and they stay checked whether or not
 * anything renders.
 */

/** The geometry the layout works in. A node's box, which xyflow needs up front because nothing here is dragged. */
export const NODE_W = 178
export const NODE_H = 56
const COL_GAP = 88
const ROW_GAP = 20
const PAD = 36
const COL_W = NODE_W + COL_GAP
const ROW_H = NODE_H + ROW_GAP

/** How far apart two rows between the same pair are drawn, so both are visible and clickable. */
export const LANE_GAP = 26

export type TraceNodeData = {
  uri: string
  kind: TraceNodeKind
  title: string | null
  /** The one line of metadata under the title, already assembled: box shape and membership are separate facts. */
  meta: string
  lit: boolean
}

export type TraceEdgeData = {
  /** How far this row bows away from the straight line between its two boxes, in content pixels. */
  spread: number
  active: boolean
  status: string
  label: string
  tooltip: string
}

export type TraceFlowNode = Node<TraceNodeData, 'trace'>
export type TraceFlowEdge = Edge<TraceEdgeData, 'trace'>

/**
 * `kind` is the BOX, and membership is a separate fact that used to be folded into it: a placeholder
 * the cluster holds and one a member merely claims are the same shape and not the same row, so `via`
 * is printed rather than encoded.
 */
const metaOf = (node: PlacedTraceNode) =>
  [
    node.member ? `${node.kind} ${node.member.via === 'member' ? 'member' : 'claimed'}` : 'named by an edge',
    node.origin ?? 'no origin',
    node.scope ?? 'no scope',
  ].join(' · ')

/** The two uris a selected row joins, which is what a selection lights up. Nodes are not selectable themselves. */
export const litNodesFor = (links: readonly TraceLink[], selected: string | undefined): Set<string> => {
  const link = links.find(row => row.key === selected)
  return new Set(link ? [link.fromUri, link.toUri] : [])
}

export const traceFlowGraph = (bundle: TraceBundle, selected?: string): {
  nodes: TraceFlowNode[]
  edges: TraceFlowEdge[]
  width: number
  height: number
} => {
  const layout = traceGraphLayout(bundle)
  const links = bundle.links ?? []
  const lanes = edgeLanes(links)
  const lit = litNodesFor(links, selected)
  const drawn = new Set(layout.nodes.map(node => node.uri))

  const nodes: TraceFlowNode[] = layout.nodes.map(node => ({
    id: node.uri,
    type: 'trace',
    position: { x: PAD + node.column * COL_W, y: PAD + node.row * ROW_H },
    // stated rather than measured: the boxes are a fixed size and nothing is dragged, so handing the
    // sizes over means the first paint is already correct instead of reflowing once measurement lands
    width: NODE_W,
    height: NODE_H,
    draggable: false,
    selectable: false,
    data: { uri: node.uri, kind: node.kind, title: node.title, meta: metaOf(node), lit: lit.has(node.uri) },
  }))

  const edges: TraceFlowEdge[] = links
    // a link whose end never became a box cannot be drawn, and silently dropping it is right: the
    // node pass already decides which uris exist, and an edge is never the thing that invents one
    .filter(link => drawn.has(link.fromUri) && drawn.has(link.toUri))
    .map(link => {
      const lane = lanes.get(link.key) ?? { lane: 0, lanes: 1 }
      return {
        id: link.key,
        type: 'trace',
        source: link.fromUri,
        target: link.toUri,
        selected: link.key === selected,
        data: {
          spread: (lane.lane - (lane.lanes - 1) / 2) * LANE_GAP,
          active: isActive(link.status),
          status: link.status,
          label: link.kind,
          tooltip: `${link.kind} ${link.status} by ${link.by}: ${link.reason}`,
        },
      }
    })

  return {
    nodes,
    edges,
    width: Math.max(1, layout.columns) * COL_W - COL_GAP + PAD * 2,
    height: Math.max(1, layout.rows) * ROW_H - ROW_GAP + PAD * 2,
  }
}
