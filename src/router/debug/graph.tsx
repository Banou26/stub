import type { EdgeProps, NodeProps } from '@xyflow/react'

import type { TraceBundle } from './trace'
import type { TraceFlowEdge, TraceFlowNode } from './flow'

import { css } from '@emotion/react'
import { Background, BackgroundVariant, Handle, Position, ReactFlow } from '@xyflow/react'
import { useCallback, useMemo } from 'preact/hooks'

import { NODE_H, NODE_W, traceFlowGraph } from './flow'

import '@xyflow/react/dist/style.css'

/**
 * The media graph: every uri the bundle names, joined by every LINK row it carries.
 *
 * DRAWN BY `@xyflow/react`, which owns panning, zooming, fitting, hit testing and keyboard access.
 * It does NOT own layout: positions still come from the app's existing franchise layout through
 * `traceFlowGraph`, because packing a relation graph into as few columns as its edges allow is the
 * one genuinely hard part here and it is already written and tested (`utils/franchise-layout.ts`).
 * What the library replaced is the part nobody wants to maintain: a hand rolled pointer drag, a non
 * passive wheel listener, a transform to keep the point under the cursor still, and the arithmetic
 * for a bezier between two boxes.
 *
 * THREE NODE SHAPES and TWO EDGE STATES, all readable without reading any text, which is the point
 * of drawing this at all: a uri its own origin described is a solid box, one no origin has described
 * is dashed yellow, a uri that is only named by an edge is dotted and dim, and a refused link is a
 * red dashed line with a cross on it while an active one is a solid green line. A refused neighbour
 * is therefore visibly present and visibly refused, instead of being absent and indistinguishable
 * from a uri nobody ever mentioned.
 *
 * THREE SHAPES AND THREE LEGEND LINES, which is a rule and not a coincidence: a fourth box style
 * shipped here with no legend entry, drawn for a `Media.owned` misreading (see `TraceNodeKind`).
 *
 * NODES ARE NOT SELECTABLE and not draggable. The inspector is about ROWS, so a click selects an
 * edge; a node lights up only as the consequence of the edge that names it. Dragging is off because
 * the position of a box carries meaning here (its column is its relation depth), so letting a reader
 * move one would let them destroy the only thing the layout is saying.
 */

const style = css`
  position: relative;
  height: 46rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.5rem;
  overflow: hidden;

  /* the library paints its own surface, so the app's dark ground has to be stated here rather than
     inherited: its default is a light one and the page around this box is not */
  .react-flow { background-color: rgb(9, 9, 10); }
  .react-flow__attribution { background: rgba(0, 0, 0, 0.4); a { color: rgba(255, 255, 255, 0.4); } }

  /* No z-index, deliberately: it is positioned and the canvas below it is not, so it already paints
     on top, and a raw layer number in a component is what src/layers.ts exists to prevent.

     BOTTOM left, not top. This box is taller than the viewport, so it is always scrolled, and the
     app's own fixed header (search field, account, the logo) paints over the top of it: at 1440x1000
     the logo covered the legend's first two lines, permanently, whatever the reader did. The bottom
     edge is the one strip of a scrolled tall box that no fixed chrome can reach. */
  .legend {
    position: absolute;
    bottom: 0.8rem;
    left: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.4rem;
    background: rgba(18, 18, 20, 0.92);
    font-size: 1.1rem;
    color: rgba(255, 255, 255, 0.6);
    cursor: default;

    b { color: #fff; font-weight: 600; }
  }

  .trace-node {
    box-sizing: border-box;
    width: ${NODE_W}px;
    height: ${NODE_H}px;
    padding: 0.5rem 0.7rem;
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.8);
    font-size: 11px;
    line-height: 1.35;
    overflow: hidden;

    &.placeholder { border-style: dashed; border-color: rgb(250, 204, 21); background: none; }
    &.named { border-style: dotted; border-color: rgba(255, 255, 255, 0.25); background: none; }
    &.lit { border-color: rgb(61, 180, 242); border-width: 2px; }

    .uri { color: #fff; font-family: monospace; }
    .meta { color: rgba(255, 255, 255, 0.45); font-size: 10px; }
    div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  }

  /* the handles carry the geometry and nothing else: an edge has to start somewhere, but this graph
     is not one anybody connects by hand, so they are never shown */
  .react-flow__handle { opacity: 0; pointer-events: none; }

  .edge { fill: none; stroke-width: 1.5; }
  .edge.active { stroke: rgb(74, 222, 128); }
  .edge.refused { stroke: rgb(248, 113, 113); stroke-dasharray: 7 5; }
  .edge.selected { stroke-width: 3; }
  .edge-hit { fill: none; stroke: transparent; stroke-width: 14; cursor: pointer; }
  .edge-label { font-size: 10px; }
  .edge-label.active { fill: rgb(134, 239, 172); }
  .edge-label.refused { fill: rgb(252, 165, 165); }
  .cross { stroke: rgb(248, 113, 113); stroke-width: 1.5; }
`

/** A uri or title cut to fit a box. Cut rather than wrapped: a debug node is one line per fact. */
const clip = (text: string, limit: number) => text.length > limit ? `${text.slice(0, limit - 1)}…` : text

/**
 * Exported for its own test. One node and one edge can be rendered on their own, with props handed to
 * them, where the whole graph cannot: `@xyflow/react` needs a measured box model to place anything and
 * the component tests run under linkedom, which has none (see ./flow.ts). So the shapes that carry
 * meaning, the three box styles and the cross on a refusal, are asserted HERE rather than through a
 * graph that never draws them.
 */
export const TraceNode = ({ data }: NodeProps<TraceFlowNode>) => (
  <div
    className={`trace-node ${data.kind}${data.lit ? ' lit' : ''}`}
    data-node={data.uri}
    data-kind={data.kind}
    title={`${data.uri} (${data.kind})`}
  >
    <Handle type="target" position={Position.Left}/>
    <div className="uri">{clip(data.uri, 26)}</div>
    <div>{data.title === null ? 'no title' : clip(data.title, 28)}</div>
    <div className="meta">{clip(data.meta, 34)}</div>
    <Handle type="source" position={Position.Right}/>
  </div>
)

export const TraceEdge = ({ data, selected, sourceX, sourceY, targetX, targetY }: EdgeProps<TraceFlowEdge>) => {
  const spread = data?.spread ?? 0
  const state = data?.active ? 'active' : 'refused'
  const forward = targetX >= sourceX
  // the fan is applied to the CONTROL points, so two rows between one pair bow apart in the middle
  // and still meet the same two boxes at the same two edges
  const bend = Math.max(20, Math.abs(targetX - sourceX) / 2) * (forward ? 1 : -1)
  const d = `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY + spread}, ${targetX - bend} ${targetY + spread}, ${targetX} ${targetY}`
  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2 + spread * 0.75

  return (
    <>
      <path className={`edge ${state}${selected ? ' selected' : ''}`} d={d}/>
      {/* the hit path is the WHOLE target: a 1.5px curve is not something a pointer can be aimed at,
          and a dashed one has gaps that miss entirely */}
      <path className="edge-hit" d={d}>
        <title>{data?.tooltip}</title>
      </path>
      {
        state === 'refused'
          ? (
            <g className="cross-mark">
              <path className="cross" d={`M ${midX - 5} ${midY - 5} L ${midX + 5} ${midY + 5}`}/>
              <path className="cross" d={`M ${midX + 5} ${midY - 5} L ${midX - 5} ${midY + 5}`}/>
            </g>
          )
          : null
      }
      <text className={`edge-label ${state}`} x={midX} y={midY - 9} textAnchor="middle">
        {clip(data?.label ?? '', 22)}
      </text>
    </>
  )
}

// module scope, because xyflow re-mounts every node and edge when these object identities change, and
// an inline literal is a new object on every render: the graph would flicker and lose its selection
const nodeTypes = { trace: TraceNode }
const edgeTypes = { trace: TraceEdge }

const Graph = ({ bundle, selected, onSelect }: {
  bundle: TraceBundle
  selected: string | undefined
  onSelect: (key: string) => void
}) => {
  const { nodes, edges } = useMemo(() => traceFlowGraph(bundle, selected), [bundle, selected])

  const onEdgeClick = useCallback(
    (_: unknown, edge: { id: string }) => onSelect(edge.id),
    [onSelect]
  )

  return (
    <div css={style} data-trace-graph>
      <div className="legend">
        <div><b>solid</b> owned: its origin described it</div>
        <div><b>dashed yellow</b> placeholder: no origin has</div>
        <div><b>dotted</b> named by an edge only</div>
        <div><b>green line</b> active link</div>
        <div><b>red dashed, crossed</b> refused link</div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onEdgeClick={onEdgeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        minZoom={0.05}
        maxZoom={20}
        aria-label="Every uri this cluster names, and every link between them"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255, 255, 255, 0.12)"/>
      </ReactFlow>
    </div>
  )
}

export default Graph
