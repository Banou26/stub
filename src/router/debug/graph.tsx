import type { TraceBundle, TraceLink } from './trace'
import type { PlacedTraceNode } from './model'
import type { View } from '../../utils/viewport'

import { css } from '@emotion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'

import { edgeLanes, isActive, traceGraphLayout } from './model'
import { IDENTITY, fit, panBy, zoomAt } from '../../utils/viewport'

/**
 * The media graph: every uri the bundle names, joined by every LINK row it carries.
 *
 * INLINE SVG, placed by hand, and the placement is the app's existing franchise layout rather than a
 * second one (see `traceGraphLayout`). Nothing here is a dependency: there is no graph library in
 * this tree and the platform's CDN allowlist has none to add.
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
 */

const NODE_W = 178
const NODE_H = 56
const COL_GAP = 88
const ROW_GAP = 20
const PAD = 36
const COL_W = NODE_W + COL_GAP
const ROW_H = NODE_H + ROW_GAP
/** How far apart two rows between the same pair are drawn, so both are visible and clickable. */
const LANE_GAP = 26
/** How far the pointer may travel and still count as a click on an edge rather than a pan. */
const SLOP = 4

const style = css`
  position: relative;
  height: 46rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.5rem;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  background-color: rgb(9, 9, 10);
  background-image: radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.12) 1px, transparent 0);
  background-size: 24px 24px;
  background-attachment: local;

  &.dragging { cursor: grabbing; }

  /* No z-index, deliberately: it is positioned and the svg below it is not, so it already paints on
     top, and a raw layer number in a component is what src/layers.ts exists to prevent.

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

  text { fill: rgba(255, 255, 255, 0.8); font-size: 11px; }
  text.uri { fill: #fff; font-family: monospace; font-size: 11px; }
  text.meta { fill: rgba(255, 255, 255, 0.45); font-size: 10px; }

  .node rect {
    fill: rgba(255, 255, 255, 0.06);
    stroke: rgba(255, 255, 255, 0.55);
    stroke-width: 1;
  }
  .node.placeholder rect { fill: none; stroke: rgb(250, 204, 21); stroke-dasharray: 6 4; }
  .node.named rect { fill: none; stroke: rgba(255, 255, 255, 0.25); stroke-dasharray: 2 3; }
  .node.selected rect { stroke: rgb(61, 180, 242); stroke-width: 2; }

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

const Graph = ({ bundle, selected, onSelect }: {
  bundle: TraceBundle
  selected: string | undefined
  onSelect: (key: string) => void
}) => {
  const layout = useMemo(() => traceGraphLayout(bundle), [bundle])
  const lanes = useMemo(() => edgeLanes(bundle.links ?? []), [bundle])

  const canvas = useRef<HTMLDivElement>(null)
  const grab = useRef<{ x: number, y: number, view: View } | undefined>(undefined)
  const moved = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState<View>(IDENTITY)

  const width = Math.max(1, layout.columns) * COL_W - COL_GAP + PAD * 2
  const height = Math.max(1, layout.rows) * ROW_H - ROW_GAP + PAD * 2
  const placed = new Map(layout.nodes.map(node => [node.uri, node]))
  const centre = (uri: string) => {
    const node = placed.get(uri)
    if (!node) return undefined
    return { x: PAD + node.column * COL_W + NODE_W / 2, y: PAD + node.row * ROW_H + NODE_H / 2 }
  }

  // Framed once per layout, so a new bundle is centred rather than leaving the reader looking at
  // empty canvas where the previous cluster was.
  useLayoutEffect(() => {
    const box = canvas.current
    // A box with no measured size cannot be fitted to: the arithmetic would zoom to the floor and
    // leave the reader looking at a smear. Happens for real when the container is not laid out yet.
    if (!box?.clientWidth || !box.clientHeight) return
    setView(fit({ width, height }, { width: box.clientWidth, height: box.clientHeight }))
  }, [width, height])

  // Bound by hand because it has to be NON-PASSIVE: a passive listener cannot preventDefault, so the
  // page would scroll under the graph and a trackpad would page-zoom the whole app instead.
  useEffect(() => {
    const box = canvas.current
    if (!box) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = box.getBoundingClientRect()
      const factor = Math.exp(-Math.sign(event.deltaY) * 0.18)
      setView(previous => zoomAt(previous, event.clientX - rect.left, event.clientY - rect.top, factor))
    }
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [])

  // `kind` is the BOX, and membership is a separate fact that used to be folded into it: a
  // placeholder the cluster holds and one a member merely claims are the same shape and not the same
  // row, so `via` is printed rather than encoded.
  const nodeLabel = (node: PlacedTraceNode) =>
    [
      node.member ? `${node.kind} ${node.member.via === 'member' ? 'member' : 'claimed'}` : 'named by an edge',
      node.origin ?? 'no origin',
      node.scope ?? 'no scope',
    ].join(' · ')

  // The selected EDGE lights the two boxes it joins, which is the question a reader asks of a
  // selection: what does this row actually relate. Nodes are not selectable themselves; the inspector
  // is about rows.
  const litNodes = useMemo(() => {
    const link = (bundle.links ?? []).find(row => row.key === selected)
    return new Set(link ? [link.fromUri, link.toUri] : [])
  }, [bundle, selected])

  const edgeGeometry = (link: TraceLink) => {
    const from = centre(link.fromUri)
    const to = centre(link.toUri)
    if (!from || !to) return undefined
    const lane = lanes.get(link.key) ?? { lane: 0, lanes: 1 }
    const spread = (lane.lane - (lane.lanes - 1) / 2) * LANE_GAP
    const forward = to.x >= from.x
    const x1 = from.x + (forward ? NODE_W / 2 : -NODE_W / 2)
    const x2 = to.x + (forward ? -NODE_W / 2 : NODE_W / 2)
    const y1 = from.y
    const y2 = to.y
    const bend = Math.max(20, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1)
    // the fan is applied to the CONTROL points, so two rows between one pair bow apart in the middle
    // and still meet the same two boxes at the same two edges
    const d = `M ${x1} ${y1} C ${x1 + bend} ${y1 + spread}, ${x2 - bend} ${y2 + spread}, ${x2} ${y2}`
    return { d, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 + spread * 0.75 }
  }

  return (
    <div
      css={style}
      className={dragging ? 'dragging' : undefined}
      ref={canvas}
      data-trace-graph
      style={{
        backgroundPosition: `${view.x}px ${view.y}px`,
        backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
      }}
      onPointerDown={event => {
        if (event.button !== 0) return
        grab.current = { x: event.clientX, y: event.clientY, view }
        moved.current = false
        setDragging(true)
      }}
      onPointerMove={event => {
        const from = grab.current
        if (!from) return
        const dx = event.clientX - from.x
        const dy = event.clientY - from.y
        if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) moved.current = true
        setView(panBy(from.view, dx, dy))
      }}
      onPointerUp={() => { grab.current = undefined; setDragging(false) }}
      onPointerCancel={() => { grab.current = undefined; setDragging(false) }}
    >
      <div className="legend" onPointerDown={event => event.stopPropagation()}>
        <div><b>solid</b> owned: its origin described it</div>
        <div><b>dashed yellow</b> placeholder: no origin has</div>
        <div><b>dotted</b> named by an edge only</div>
        <div><b>green line</b> active link</div>
        <div><b>red dashed, crossed</b> refused link</div>
      </div>
      <svg width="100%" height="100%" role="img" aria-label="Every uri this cluster names, and every link between them">
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {
            (bundle.links ?? []).map(link => {
              const geometry = edgeGeometry(link)
              if (!geometry) return null
              const state = isActive(link.status) ? 'active' : 'refused'
              const on = selected === link.key ? ' selected' : ''
              return (
                <g key={link.key} data-edge={link.key} data-status={link.status}>
                  <path className={`edge ${state}${on}`} d={geometry.d}/>
                  {/* the hit path is the WHOLE target: a 1.5px curve is not something a pointer can
                      be aimed at, and a dashed one has gaps that miss entirely */}
                  <path
                    className="edge-hit"
                    d={geometry.d}
                    onClick={() => { if (!moved.current) onSelect(link.key) }}
                  >
                    <title>{`${link.kind} ${link.status} by ${link.by}: ${link.reason}`}</title>
                  </path>
                  {
                    state === 'refused'
                      ? (
                        <g className="cross-mark" onClick={() => { if (!moved.current) onSelect(link.key) }}>
                          <path className="cross" d={`M ${geometry.midX - 5} ${geometry.midY - 5} L ${geometry.midX + 5} ${geometry.midY + 5}`}/>
                          <path className="cross" d={`M ${geometry.midX + 5} ${geometry.midY - 5} L ${geometry.midX - 5} ${geometry.midY + 5}`}/>
                        </g>
                      )
                      : null
                  }
                  <text className={`edge-label ${state}`} x={geometry.midX} y={geometry.midY - 9} textAnchor="middle">
                    {clip(link.kind, 22)}
                  </text>
                </g>
              )
            })
          }
          {
            layout.nodes.map(node => {
              const spot = centre(node.uri)!
              const left = spot.x - NODE_W / 2
              const top = spot.y - NODE_H / 2
              const on = litNodes.has(node.uri) ? ' selected' : ''
              return (
                <g key={node.uri} className={`node ${node.kind}${on}`} data-node={node.uri} data-kind={node.kind}>
                  <rect x={left} y={top} width={NODE_W} height={NODE_H} rx={4}/>
                  <text className="uri" x={left + 10} y={top + 18}>{clip(node.uri, 26)}</text>
                  <text x={left + 10} y={top + 33}>{node.title === null ? 'no title' : clip(node.title, 28)}</text>
                  <text className="meta" x={left + 10} y={top + 47}>{clip(nodeLabel(node), 34)}</text>
                  <title>{`${node.uri} (${node.kind})`}</title>
                </g>
              )
            })
          }
        </g>
      </svg>
    </div>
  )
}

export default Graph
