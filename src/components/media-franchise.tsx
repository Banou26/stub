import type { GetMediaModalSubscription } from '../generated/graphql'

import { css } from '@emotion/react'
import { useMemo } from 'preact/hooks'
import { Link } from 'wouter'

import { getRoutePath, Route } from '../router/path'
import { layoutFranchise, nodeTitle } from '../utils/franchise-layout'
import { relationLabel, workFormatLabel } from '../utils/relation-labels'

/**
 * Every work in a series, drawn as a graph.
 *
 * INLINE SVG and hand placed, because nothing in this tree lays out a graph: there is no d3, dagre,
 * elkjs, cytoscape or react-flow in the dependencies and none reachable transitively. The arithmetic
 * lives in utils/franchise-layout.ts where it can be tested; this turns columns and rows into pixels
 * and draws.
 *
 * FOREIGN OBJECT is deliberately not used for the boxes. It is the obvious way to put wrapped HTML
 * text in an SVG and it is the one thing here that renders differently across engines, so the node
 * label is `<text>` with an explicit line break instead: fewer lines of title, and the same in every
 * browser.
 */

type Franchise = NonNullable<NonNullable<GetMediaModalSubscription['media']>['franchise']>

/** Node box and the space around it, in svg units. One unit is one css pixel at scale 1. */
const NODE_W = 190
const NODE_H = 74
const COL_GAP = 110
const ROW_GAP = 26
const PAD = 20

const COL_W = NODE_W + COL_GAP
const ROW_H = NODE_H + ROW_GAP

const style = css`
  margin-top: 4rem;

  & > .heading {
    font-size: 1.8rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 1.5rem;
  }

  & > .canvas {
    /* the graph is wider than the modal for anything but a short series, and scrolls in its own box
       rather than widening the dialog */
    overflow-x: auto;
    overscroll-behavior-x: contain;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.6rem;
    padding: 0.5rem;
  }

  .edge {
    fill: none;
    stroke: rgba(255, 255, 255, 0.25);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }

  .edge-label {
    fill: rgba(255, 255, 255, 0.55);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-anchor: middle;
  }

  .node rect {
    fill: rgb(28, 28, 30);
    stroke: rgba(255, 255, 255, 0.14);
    stroke-width: 1;
    rx: 6;
  }

  .node:hover rect {
    fill: rgb(42, 42, 46);
    stroke: rgba(255, 255, 255, 0.35);
  }

  /* the work whose page this is, so a reader can find themselves in a franchise of thirty */
  .node.current rect {
    stroke: rgb(61, 180, 242);
    stroke-width: 2;
  }

  .node .title {
    fill: rgba(255, 255, 255, 0.95);
    font-size: 12px;
    font-weight: 700;
    text-anchor: middle;
  }

  .node .meta {
    fill: rgba(255, 255, 255, 0.5);
    font-size: 10px;
    text-anchor: middle;
  }
`

/**
 * A title broken into at most two lines that fit the box.
 *
 * Measured in CHARACTERS rather than pixels, which is approximate and deliberately so: measuring text
 * in svg needs a live layout, and a franchise redraws on every store update. The cap is tuned to the
 * 12px bold face at NODE_W; a title that overruns is cut with an ellipsis rather than allowed to
 * spill across the arrows.
 */
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
  const kept = shown.join(' ')
  if (kept.length < title.length && shown.length) {
    shown[shown.length - 1] = `${shown[shown.length - 1]!.slice(0, LINE - 1)}…`
  }
  return shown.length ? shown : [title.slice(0, LINE)]
}

const MediaFranchise = ({ franchise, currentUris }: { franchise: Franchise | null | undefined, currentUris: readonly string[] }) => {
  const layout = useMemo(() => franchise ? layoutFranchise(franchise) : undefined, [franchise])

  // A graph of one work is the work itself, which the page is already showing.
  if (!layout || layout.nodes.length < 2) return null

  const width = layout.columns * COL_W - COL_GAP + PAD * 2
  const height = layout.rows * ROW_H - ROW_GAP + PAD * 2
  const at = new Map(layout.nodes.map(node => [node.uri, node]))
  const x = (column: number) => PAD + column * COL_W
  const y = (row: number) => PAD + row * ROW_H
  const current = new Set(currentUris)

  return (
    <div css={style} data-franchise>
      <div className="heading">Series</div>
      <div className="canvas">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Every work in this series">
          {
            layout.edges.map(edge => {
              const from = at.get(edge.from)
              const to = at.get(edge.to)
              if (!from || !to) return null
              const x1 = x(from.column) + NODE_W
              const y1 = y(from.row) + NODE_H / 2
              const x2 = x(to.column)
              const y2 = y(to.row) + NODE_H / 2
              // a horizontal cubic: the control points sit half the gap out from each end, so an edge
              // between two columns leaves and arrives flat however far apart the rows are
              const bend = Math.max(24, (x2 - x1) / 2)
              // The label sits a third of the way along rather than at the midpoint. Everything
              // pointing AT one work converges there, so midpoint labels land on each other in a
              // stack; a third of the way out they are still spread by where each edge started.
              const ALONG = 0.34
              const on = (a: number, b: number) => a + (b - a) * ALONG
              return (
                <g key={`${edge.from}-${edge.to}-${edge.relation}`}>
                  <path className="edge" d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}/>
                  <text className="edge-label" x={on(x1, x2)} y={on(y1, y2) - 6}>
                    {relationLabel(edge.relation).toUpperCase()}
                  </text>
                </g>
              )
            })
          }
          {
            layout.nodes.map(node => {
              const lines = titleLines(nodeTitle(node))
              const meta = [workFormatLabel(node.format), node.episodeCount ? `${node.episodeCount} ep` : undefined]
                .filter(Boolean).join(' · ')
              return (
                <Link
                  key={node.uri}
                  className={`node${current.has(node.uri) ? ' current' : ''}`}
                  to={getRoutePath(Route.MEDIA, { uri: node.uri })}
                >
                  <g>
                    <rect x={x(node.column)} y={y(node.row)} width={NODE_W} height={NODE_H}/>
                    {
                      lines.map((line, index) => (
                        <text
                          key={line + index}
                          className="title"
                          x={x(node.column) + NODE_W / 2}
                          y={y(node.row) + (lines.length === 1 ? 32 : 26) + index * 15}
                        >
                          {line}
                        </text>
                      ))
                    }
                    {
                      meta
                        ? <text className="meta" x={x(node.column) + NODE_W / 2} y={y(node.row) + NODE_H - 14}>{meta}</text>
                        : undefined
                    }
                  </g>
                </Link>
              )
            })
          }
        </svg>
      </div>
    </div>
  )
}

export default MediaFranchise
