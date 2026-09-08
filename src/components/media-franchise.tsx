import type { GetMediaModalSubscription } from '../generated/graphql'

import { css } from '@emotion/react'
import { FloatingFocusManager, FloatingOverlay, FloatingPortal, useClick, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react'
import { Network, X } from 'lucide-react'
import { useMemo, useState } from 'preact/hooks'
import { Link } from 'wouter'

import { getRoutePath, Route } from '../router/path'
import { formatsIn, isVideoFormat, layoutFranchise, nodeTitle, trackOffsets } from '../utils/franchise-layout'
import { relationLabel, workFormatLabel } from '../utils/relation-labels'

/**
 * Every work in a series, drawn as a graph, in a dialog of its own.
 *
 * INLINE SVG and hand placed, because nothing in this tree lays out a graph: there is no d3, dagre,
 * elkjs, cytoscape or react-flow in the dependencies and none reachable transitively. The arithmetic
 * lives in utils/franchise-layout.ts where it can be tested; this turns columns and rows into pixels.
 *
 * A FILTERED WORK COLLAPSES TO A DOT RATHER THAN DISAPPEARING, and that is what keeps the graph
 * honest. A franchise hangs off its source novel: the seasons relate to the book rather than to each
 * other, so deleting the books to show only what plays leaves the seasons as loose boxes with no
 * arrows at all. Measured 2026-09-08 on `Tensei Shitara Slime Datta Ken`, video only: 10 works in 5
 * disconnected pieces, four of them with no edge whatsoever. A collapsed work keeps its place and its
 * arrows and shrinks, so the shape of the series survives and a column of novels costs a sliver
 * instead of a screen. Clicking one opens it. Nothing here derives an arrow, so every relation drawn
 * is one a source actually stated.
 *
 * FOREIGN OBJECT is deliberately not used for the boxes. It is the obvious way to put wrapped HTML
 * text in an SVG and it is the one thing here that renders differently across engines, so a node's
 * label is `<text>` with explicit lines instead.
 */

type Franchise = NonNullable<NonNullable<GetMediaModalSubscription['media']>['franchise']>

const NODE_W = 190
const NODE_H = 74
/** A collapsed work: big enough to hit, small enough that a shelf of novels costs one narrow column. */
const DOT = 22
const COL_GAP = 90
const ROW_GAP = 24
const PAD = 24

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
       filters can wrap without pushing it off */
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
    padding: 1rem;
  }

  .edge {
    fill: none;
    stroke: rgba(255, 255, 255, 0.25);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
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

  .dot {
    cursor: pointer;

    circle {
      fill: rgb(38, 38, 42);
      stroke: rgba(255, 255, 255, 0.3);
      stroke-width: 1.5;
    }

    &:hover circle { fill: rgb(61, 180, 242); stroke: #fff; }
  }
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

const Graph = ({ franchise, currentUris }: { franchise: Franchise, currentUris: readonly string[] }) => {
  const formats = useMemo(() => formatsIn(franchise), [franchise])
  // Video by default: the novels and manga are context, and a viewer of this app came for what plays.
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set(formats.filter(isVideoFormat)))
  // Works opened one at a time by clicking their dot. Kept separately from the filters so toggling a
  // filter off again does not shut something the reader deliberately opened.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set())

  const layout = useMemo(() => layoutFranchise(franchise), [franchise])
  const current = new Set(currentUris)

  // the work whose page this is stays open whatever the filters say: it is where the reader IS, and a
  // graph that collapses the one thing you are looking at has lost its anchor
  const isOpen = (node: { uri: string, format?: string | null }) =>
    current.has(node.uri) || opened.has(node.uri) || !node.format || shown.has(node.format)

  const columnSizes: number[] = []
  const rowSizes: number[] = []
  for (const node of layout.nodes) {
    const open = isOpen(node)
    columnSizes[node.column] = Math.max(columnSizes[node.column] ?? DOT, open ? NODE_W : DOT)
    rowSizes[node.row] = Math.max(rowSizes[node.row] ?? DOT, open ? NODE_H : DOT)
  }
  for (let index = 0; index < layout.columns; index++) columnSizes[index] ??= DOT
  for (let index = 0; index < layout.rows; index++) rowSizes[index] ??= DOT

  const columnAt = trackOffsets(columnSizes, COL_GAP)
  const rowAt = trackOffsets(rowSizes, ROW_GAP)
  const width = (columnAt.at(-1) ?? 0) + (columnSizes.at(-1) ?? 0) + PAD * 2
  const height = (rowAt.at(-1) ?? 0) + (rowSizes.at(-1) ?? 0) + PAD * 2

  const placed = new Map(layout.nodes.map(node => [node.uri, node]))
  /** The centre of a work's cell, which is where its arrows meet at whatever size it is drawn. */
  const centre = (uri: string) => {
    const node = placed.get(uri)
    if (!node) return undefined
    return {
      x: PAD + (columnAt[node.column] ?? 0) + (columnSizes[node.column] ?? DOT) / 2,
      y: PAD + (rowAt[node.row] ?? 0) + (rowSizes[node.row] ?? DOT) / 2,
      open: isOpen(node),
    }
  }

  const open = (uri: string) => setOpened(previous => new Set(previous).add(uri))
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
      <div className="canvas">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Every work in this series">
          {
            layout.edges.map(edge => {
              const from = centre(edge.from)
              const to = centre(edge.to)
              if (!from || !to) return null
              // right edge of the source cell to the left edge of the target's, so an arrow leaves a
              // dot and an open card the same way
              const x1 = from.x + (from.open ? NODE_W : DOT) / 2
              const x2 = to.x - (to.open ? NODE_W : DOT) / 2
              const bend = Math.max(20, (x2 - x1) / 2)
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
              const kind = node.format ? ` (${workFormatLabel(node.format)})` : ''
              if (!spot.open) {
                return (
                  <g
                    key={node.uri}
                    className="dot"
                    role="button"
                    tabIndex={0}
                    data-collapsed
                    onClick={() => open(node.uri)}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') open(node.uri) }}
                  >
                    <circle cx={spot.x} cy={spot.y} r={DOT / 2}/>
                    {/* the whole label, since a dot shows none of it until it is opened */}
                    <title>{`${title}${kind}`}</title>
                  </g>
                )
              }
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
                    <title>{`${title}${kind}`}</title>
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
