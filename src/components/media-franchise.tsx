import type { GetMediaModalSubscription } from '../generated/graphql'

import { css } from '@emotion/react'
import { FloatingFocusManager, FloatingOverlay, FloatingPortal, useClick, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react'
import { Network, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'preact/hooks'
import { Link } from 'wouter'

import { getRoutePath, Route } from '../router/path'
import { formatsIn, isVideoFormat, layoutFranchise, nodeTitle, onlyFormats } from '../utils/franchise-layout'
import { relationLabel, workFormatLabel } from '../utils/relation-labels'

/**
 * Every work in a series, drawn left to right IN THE ORDER IT HAPPENED.
 *
 * INLINE SVG and hand placed, because nothing in this tree lays out a graph: there is no d3, dagre,
 * elkjs, cytoscape or react-flow in the dependencies and none reachable transitively. The arithmetic
 * lives in utils/franchise-layout.ts where it can be tested; this turns columns and rows into pixels.
 *
 * TWO KINDS OF ARROW, and the difference is the point. A dashed labelled one is a relationship a
 * source stated: sequel, side story, spin off. A solid unlabelled one is the READING ORDER, derived
 * here from the dates, and it runs straight along the timeline so "season one, season two, the film,
 * season three" can be read off the picture without following any relation at all. An earlier version
 * laid works out by graph depth instead, which hung the whole series off its source novel and left
 * the order nowhere in the shape.
 *
 * FOREIGN OBJECT is deliberately not used for the boxes. It is the obvious way to put wrapped HTML
 * text in an SVG and it is the one thing here that renders differently across engines, so a node's
 * label is `<text>` with explicit lines instead.
 */

type Franchise = NonNullable<NonNullable<GetMediaModalSubscription['media']>['franchise']>

const NODE_W = 190
const NODE_H = 74
const COL_GAP = 90
const ROW_GAP = 24
const PAD = 40
const COL_W = NODE_W + COL_GAP
const ROW_H = NODE_H + ROW_GAP

const triggerStyle = css`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 0.5rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  font-family: inherit;
  font-size: 1.3rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.06);
  }

  svg { width: 1.5rem; height: 1.5rem; }
`

const overlayStyle = css`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  background: rgba(0, 0, 0, 0.75);
  /* above the media modal (1000) and the header over it (1100): this opens from inside that modal */
  z-index: 1200;

  .sheet {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    max-width: 170rem;
    background: rgb(18, 18, 20);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.8rem;
    overflow: hidden;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 2rem;
    /* right padding clears the close button, which is positioned rather than in the flow so the
       filters can wrap without pushing it off the edge */
    padding: 1.5rem 7rem 1.5rem 2rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);

    & > .title {
      font-size: 1.8rem;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
    }

    & > .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6rem;
    }
  }

  .close {
    position: absolute;
    top: 1.4rem;
    right: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.4rem;
    height: 3.4rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 50%;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;

    &:hover { color: #fff; border-color: rgba(255, 255, 255, 0.4); }
    svg { width: 1.7rem; height: 1.7rem; }
  }

  .chip {
    display: inline-flex;
    align-items: center;
    padding: 0.4rem 1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-family: inherit;
    font-size: 1.25rem;
    font-weight: 600;
    cursor: pointer;

    &.on {
      color: #fff;
      border-color: rgba(61, 180, 242, 0.7);
      background: rgba(61, 180, 242, 0.15);
    }
  }

  .canvas {
    flex: 1;
    overflow: auto;
    /* centred while it fits, and SAFE so a graph bigger than the box is not clipped at its start:
       plain centring on an overflowing grid pushes the first column out of reach of any scroll */
    display: grid;
    place-content: safe center;
    /* dragged rather than scrolled, so the pointer says so before it is pressed */
    cursor: grab;
    background-color: rgb(9, 9, 10);
    /* the paper the graph is drawn on: one faint dot every 24px, which gives the panning something to
       move against. The local attachment is load bearing: the default pins the grid to the viewport,
       and the graph would then appear to slide over a field that never moves */
    background-image: radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.14) 1px, transparent 0);
    background-size: 24px 24px;
    background-attachment: local;

    &.dragging { cursor: grabbing; }
  }

  /* a relationship a source stated */
  .edge {
    fill: none;
    stroke: rgba(255, 255, 255, 0.22);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }

  /* the reading order, derived from the dates: solid, brighter, and never labelled */
  .chain {
    fill: none;
    stroke: rgba(61, 180, 242, 0.55);
    stroke-width: 2;
  }

  .edge-label {
    fill: rgba(255, 255, 255, 0.5);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-anchor: middle;
  }

  .node rect {
    fill: rgb(28, 28, 30);
    stroke: rgba(255, 255, 255, 0.14);
    rx: 6;
  }

  .node:hover rect { fill: rgb(42, 42, 46); stroke: rgba(255, 255, 255, 0.35); }
  .node.current rect { stroke: rgb(61, 180, 242); stroke-width: 2; }

  .node .title { fill: rgba(255, 255, 255, 0.95); font-size: 12px; font-weight: 700; text-anchor: middle; }
  .node .meta { fill: rgba(255, 255, 255, 0.5); font-size: 10px; text-anchor: middle; }
`

/** A title broken into at most two lines that fit the box, measured in characters. */
const LINE = 24
const titleLines = (title: string): string[] => {
  const words = title.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length <= LINE) { line = next; continue }
    if (lines.length === 1) break
    if (line) lines.push(line)
    line = word
  }
  if (line && lines.length < 2) lines.push(line)
  const shown = lines.slice(0, 2)
  if (shown.join(' ').length < title.length && shown.length) {
    shown[shown.length - 1] = `${shown[shown.length - 1]!.slice(0, LINE - 1)}…`
  }
  return shown.length ? shown : [title.slice(0, LINE)]
}

/** How far the pointer may travel and still count as a click rather than a drag. */
const SLOP = 4

const Graph = ({ franchise, currentUris }: { franchise: Franchise, currentUris: readonly string[] }) => {
  const formats = useMemo(() => formatsIn(franchise), [franchise])
  // Video by default. Stub aggregates things you watch, so a novel or a manga is context rather than
  // somewhere to go: its page here has no episodes and nothing to read.
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set(formats.filter(isVideoFormat)))

  const layout = useMemo(
    () => layoutFranchise(onlyFormats(franchise, node => !node.format || shown.has(node.format))),
    [franchise, shown],
  )
  const current = new Set(currentUris)

  const canvas = useRef<HTMLDivElement>(null)
  const grab = useRef<{ x: number, y: number, left: number, top: number } | undefined>(undefined)
  const [dragging, setDragging] = useState(false)
  // Remembered past the pointerup, because the CLICK fires after it: a drag that ends over a work
  // would otherwise navigate to it, and every attempt to pan the graph would leave the page.
  const moved = useRef(false)

  const width = Math.max(1, layout.columns) * COL_W - COL_GAP + PAD * 2
  const height = Math.max(1, layout.rows) * ROW_H - ROW_GAP + PAD * 2
  const placed = new Map(layout.nodes.map(node => [node.uri, node]))
  const centre = (uri: string) => {
    const node = placed.get(uri)
    if (!node) return undefined
    return { x: PAD + node.column * COL_W + NODE_W / 2, y: PAD + node.row * ROW_H + NODE_H / 2 }
  }

  const toggle = (format: string) =>
    setShown(previous => {
      const next = new Set(previous)
      if (next.has(format)) next.delete(format)
      else next.add(format)
      return next
    })

  return (
    <>
      <div className="bar">
        <div className="title">Series</div>
        <div className="filters">
          {
            formats.map(format => (
              <button
                key={format}
                type="button"
                className={`chip${shown.has(format) ? ' on' : ''}`}
                aria-pressed={shown.has(format)}
                onClick={() => toggle(format)}
              >
                {workFormatLabel(format)}
              </button>
            ))
          }
        </div>
      </div>
      <div
        className={`canvas${dragging ? ' dragging' : ''}`}
        ref={canvas}
        data-canvas
        onPointerDown={event => {
          const box = canvas.current
          if (!box || event.button !== 0) return
          grab.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop }
          moved.current = false
          setDragging(true)
        }}
        onPointerMove={event => {
          const box = canvas.current
          const from = grab.current
          if (!box || !from) return
          const dx = event.clientX - from.x
          const dy = event.clientY - from.y
          if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) moved.current = true
          box.scrollLeft = from.left - dx
          box.scrollTop = from.top - dy
        }}
        onPointerUp={() => { grab.current = undefined; setDragging(false) }}
        onPointerLeave={() => { grab.current = undefined; setDragging(false) }}
        onClickCapture={event => {
          // captured, so it never reaches the link underneath
          if (!moved.current) return
          event.preventDefault()
          event.stopPropagation()
          moved.current = false
        }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Every work in this series, in order">
          {
            layout.chain.map(step => {
              const from = centre(step.from)
              const to = centre(step.to)
              if (!from || !to) return null
              const x1 = from.x + NODE_W / 2
              const x2 = to.x - NODE_W / 2
              const bend = Math.max(20, (x2 - x1) / 2)
              return (
                <path
                  key={`chain-${step.from}-${step.to}`}
                  className="chain"
                  d={`M ${x1} ${from.y} C ${x1 + bend} ${from.y}, ${x2 - bend} ${to.y}, ${x2} ${to.y}`}
                />
              )
            })
          }
          {
            layout.edges.map(edge => {
              const from = centre(edge.from)
              const to = centre(edge.to)
              if (!from || !to) return null
              const forward = to.x >= from.x
              const x1 = from.x + (forward ? NODE_W / 2 : -NODE_W / 2)
              const x2 = to.x + (forward ? -NODE_W / 2 : NODE_W / 2)
              const bend = Math.max(20, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1)
              // a third of the way along rather than the midpoint: everything pointing AT one work
              // converges there, so midpoint labels land on each other in a stack
              const ALONG = 0.34
              const on = (a: number, b: number) => a + (b - a) * ALONG
              return (
                <g key={`${edge.from}-${edge.to}-${edge.relation}`}>
                  <path className="edge" d={`M ${x1} ${from.y} C ${x1 + bend} ${from.y}, ${x2 - bend} ${to.y}, ${x2} ${to.y}`}/>
                  <text className="edge-label" x={on(x1, x2)} y={on(from.y, to.y) - 6}>
                    {relationLabel(edge.relation).toUpperCase()}
                  </text>
                </g>
              )
            })
          }
          {
            layout.nodes.map(node => {
              const spot = centre(node.uri)!
              const title = nodeTitle(node)
              const lines = titleLines(title)
              const meta = [workFormatLabel(node.format), node.episodeCount ? `${node.episodeCount} ep` : undefined]
                .filter(Boolean).join(' · ')
              const left = spot.x - NODE_W / 2
              const top = spot.y - NODE_H / 2
              return (
                <Link
                  key={node.uri}
                  className={`node${current.has(node.uri) ? ' current' : ''}`}
                  to={getRoutePath(Route.MEDIA, { uri: node.uri })}
                >
                  <g>
                    <rect x={left} y={top} width={NODE_W} height={NODE_H}/>
                    {
                      lines.map((line, index) => (
                        <text key={line + index} className="title" x={spot.x} y={top + (lines.length === 1 ? 32 : 26) + index * 15}>
                          {line}
                        </text>
                      ))
                    }
                    {meta ? <text className="meta" x={spot.x} y={top + NODE_H - 14}>{meta}</text> : undefined}
                    <title>{title}</title>
                  </g>
                </Link>
              )
            })
          }
        </svg>
      </div>
    </>
  )
}

const MediaFranchise = ({ franchise, currentUris }: { franchise: Franchise | null | undefined, currentUris: readonly string[] }) => {
  const [open, setOpen] = useState(false)
  const { refs, context } = useFloating({ open, onOpenChange: setOpen })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context, { outsidePress: true }),
    useRole(context, { role: 'dialog' }),
  ])

  // A graph of one work is the work itself, which the page already shows.
  if (!franchise || (franchise.nodes?.length ?? 0) < 2) return null

  return (
    <>
      <button type="button" css={triggerStyle} ref={refs.setReference} {...getReferenceProps()} data-franchise-open>
        <Network/>
        See detailed relation graph
      </button>
      {
        open
          ? (
            <FloatingPortal>
              <FloatingOverlay lockScroll css={overlayStyle} data-franchise>
                <FloatingFocusManager context={context}>
                  <div className="sheet" ref={refs.setFloating} {...getFloatingProps()}>
                    <Graph franchise={franchise} currentUris={currentUris}/>
                    <button type="button" className="close" aria-label="Close" onClick={() => setOpen(false)}>
                      <X/>
                    </button>
                  </div>
                </FloatingFocusManager>
              </FloatingOverlay>
            </FloatingPortal>
          )
          : undefined
      }
    </>
  )
}

export default MediaFranchise
