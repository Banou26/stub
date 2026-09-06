// How the search page lays its results out. Pure and preact-free so it can be tested, for the reason
// ./params.ts gives: the page itself reaches wouter and preact.

/**
 * The three layouts the results can take.
 *
 * `grid` is covers alone, `card` is a cover beside the detail that fits in a paragraph, `list` is one
 * row per media with every column aligned down the page.
 */
export type DisplayMode = 'grid' | 'card' | 'list'

/** The modes the toggle offers, in the order it renders them: densest first. */
export const DISPLAY_MODES = [
  { value: 'grid', label: 'Covers' },
  { value: 'card', label: 'Cards' },
  { value: 'list', label: 'List' },
] as const satisfies readonly { value: DisplayMode, label: string }[]

export const DEFAULT_DISPLAY_MODE: DisplayMode = 'grid'

/**
 * Where the choice is kept.
 *
 * Deliberately NOT a url param, unlike every filter on this page. A layout is how one reader likes to
 * look at results rather than part of what was asked for, so it has to survive the next search and
 * must not travel with a shared link and re-lay-out the page for whoever opens it.
 */
export const DISPLAY_MODE_KEY = 'stub-search-display-mode'

const MODE_VALUES: readonly string[] = DISPLAY_MODES.map(mode => mode.value)

/** A stored or hand-edited value as a mode, falling back to the default rather than throwing. */
export const parseDisplayMode = (raw: string | null | undefined): DisplayMode =>
  MODE_VALUES.includes(raw as DisplayMode) ? raw as DisplayMode : DEFAULT_DISPLAY_MODE

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

// Reading `localStorage` THROWS, rather than answering null, when a browser is set to block site
// data, and this runs on the first render of a page that has to show results either way.
const defaultStorage = (): StorageLike | undefined => {
  try { return globalThis.localStorage } catch { return undefined }
}

export const readDisplayMode = (storage = defaultStorage()): DisplayMode => {
  try { return parseDisplayMode(storage?.getItem(DISPLAY_MODE_KEY)) } catch { return DEFAULT_DISPLAY_MODE }
}

export const writeDisplayMode = (mode: DisplayMode, storage = defaultStorage()): void => {
  try { storage?.setItem(DISPLAY_MODE_KEY, mode) } catch { /* a reader who blocks storage still gets the layout, just not next time */ }
}
