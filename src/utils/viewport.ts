// Panning and zooming a drawing that is bigger than its window.
//
// Pure, because the one interesting part is arithmetic and it is easy to get subtly wrong: zooming
// has to keep the point under the pointer where it is, and a version that scales about the origin
// instead looks almost right while sliding the thing you aimed at out from under the cursor.

/**
 * Where the drawing sits and how big it is: content point `p` is drawn at `p * k + (x, y)`.
 *
 * A TRANSFORM rather than a scroll offset. Scrolling can only reach the content's own bounds, so a
 * graph could never be dragged past its edges and a zoomed-out one was pinned to a corner. A
 * transform has no bounds at all, which is what makes the canvas feel like a surface rather than a
 * document.
 */
export type View = { x: number, y: number, k: number }

export const IDENTITY: View = { x: 0, y: 0, k: 1 }

/**
 * How far in and out a viewer may go.
 *
 * Not literally unbounded: below the floor a graph is a smear of sub-pixel lines that no amount of
 * further zooming makes smaller in any useful way, and above the ceiling the numbers start losing
 * precision in the transform. The range spans roughly 400x, which is far more than any franchise
 * needs and enough that neither end is reachable by accident.
 */
export const MIN_SCALE = 0.05
export const MAX_SCALE = 20

export const clampScale = (scale: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number.isFinite(scale) ? scale : 1))

/** Move the drawing by a screen distance. The scale is untouched: dragging never resizes. */
export const panBy = (view: View, dx: number, dy: number): View =>
  ({ ...view, x: view.x + dx, y: view.y + dy })

/** The content coordinate currently drawn at a screen point. */
export const toContent = (view: View, screenX: number, screenY: number): { x: number, y: number } =>
  ({ x: (screenX - view.x) / view.k, y: (screenY - view.y) / view.k })

/**
 * Scale about a screen point, leaving whatever is under it exactly where it is.
 *
 * The anchor is the whole point. Zooming about the origin is one line shorter and feels broken: the
 * content the viewer is pointing at slides away as it grows, so they chase it across the canvas. So
 * the content point under the pointer is solved for first and the offset re-derived to put it back.
 *
 * At the limits the factor is absorbed rather than the anchor being dropped, so a wheel spun past
 * full zoom leaves the picture still rather than drifting.
 */
export const zoomAt = (view: View, screenX: number, screenY: number, factor: number): View => {
  const scale = clampScale(view.k * (Number.isFinite(factor) && factor > 0 ? factor : 1))
  if (scale === view.k) return view
  const point = toContent(view, screenX, screenY)
  return { k: scale, x: screenX - point.x * scale, y: screenY - point.y * scale }
}

/**
 * The view that puts a drawing of the given size in the middle of a window of the given size.
 *
 * Never scales UP: a two node graph blown up to fill a wide dialog looks like a mistake. It shrinks
 * only when it has to, with a margin so nothing touches the edges.
 */
export const fit = (
  content: { width: number, height: number },
  window: { width: number, height: number },
  margin = 32,
): View => {
  const usableWidth = Math.max(1, window.width - margin * 2)
  const usableHeight = Math.max(1, window.height - margin * 2)
  if (content.width <= 0 || content.height <= 0) return IDENTITY
  const scale = clampScale(Math.min(1, usableWidth / content.width, usableHeight / content.height))
  return {
    k: scale,
    x: (window.width - content.width * scale) / 2,
    y: (window.height - content.height * scale) / 2,
  }
}
