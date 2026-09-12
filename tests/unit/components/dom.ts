import type { ComponentChild } from 'preact'

import { parseHTML } from 'linkedom'
import { render } from 'preact'
import { act } from 'preact/test-utils'

/**
 * A DOM for the component tests, installed on `globalThis` as a side effect of importing this file.
 *
 * IMPORT IT FIRST, above every other import in a test file. `@emotion/react` decides at MODULE SCOPE
 * whether it is running in a browser (`typeof document !== 'undefined'`) and builds its style cache
 * there, so a document installed after emotion has been evaluated leaves every `css` prop with a null
 * cache: the render then dies inside emotion, at `cache.key`, rather than in the component under
 * test. Module bodies run in import order, so the position of this import is the whole fix.
 */
const dom = parseHTML('<!doctype html><html><head></head><body></body></html>')

// `HTMLElement` is in this list for emotion's sake and not preact's: its browser build gates the
// default style cache on `typeof HTMLElement !== 'undefined'` rather than on `document`, so a
// document with no constructors beside it gets that null cache all the same.
const { CustomEvent, DocumentFragment, Element, Event, HTMLElement, Node, SVGElement, Text } = dom

Object.assign(globalThis, {
  document: dom.document,
  window: dom.window,
  CustomEvent, DocumentFragment, Element, Event, HTMLElement, Node, SVGElement, Text,
})

/** Renders into a fresh host element attached to the document, and flushes the render. */
export const mount = (vnode: ComponentChild) => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => { render(vnode, host) })
  return host
}

/** Unmounts a tree put up by `mount` and takes its host out of the document. */
export const unmount = (host: HTMLElement) => {
  act(() => { render(null, host) })
  host.remove()
}

/** The button of a rendered tree carrying this label, if there is one. */
export const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('button')].find(candidate => candidate.textContent === label)
