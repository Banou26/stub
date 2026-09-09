import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, describe, test } from 'vitest'

// These invariants are CSS and one HTML attribute, so there is nothing to import and call. They are
// read off the source instead, the way tests/unit/sources/index.test.ts reads the schema, and every
// one of them carries a control: a regex that stopped matching would otherwise report a passing
// invariant it never looked at.
//
// What no unit test here can do is LAY THE PAGE OUT, so each rule's behaviour was measured in a real
// browser and the number is recorded with the rule. The stacking rows have a standing browser check
// too, scripts/check-modal-header.mjs, which opens a real modal over a real party and hit-tests each
// control with the old z-index as its control. That file is the one that can see a layer covered;
// this one is what fails in CI when the number moves.

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf-8')

const zIndexOf = (source: string, after: string) => {
  const from = source.indexOf(after)
  if (from < 0) return undefined
  const match = /z-index:\s*(\d+)/.exec(source.slice(from))
  return match ? Number(match[1]) : undefined
}

describe('the stacking order', () => {
  const modalLayer = zIndexOf(read('src/router/home/media-modal.tsx'), 'const style = css`')
  const headerLayer = zIndexOf(read('src/components/header.tsx'), 'const style = css`')
  const franchiseLayer = zIndexOf(read('src/components/media-franchise.tsx'), 'const overlayStyle = css`')
  const promptLayer = zIndexOf(read('src/components/plugin-prompt.tsx'), 'const style = css`')
  const cursorLayer = zIndexOf(read('src/components/party-cursor.tsx'), 'const style = css`')

  /**
   * Everything the header owns, which is the band that has to survive an open modal.
   *
   * A menu here is PORTALLED TO THE BODY, so it competes in the root stacking context on its own
   * number and does not inherit the header's. The chat is not portalled and lands in the same place
   * for the other reason: it is fixed at the router root, whose ancestors open no stacking context.
   */
  const headerBand = {
    'the party menu': zIndexOf(read('src/components/party-widget.tsx'), 'const menuStyle = css`'),
    'the account menu': zIndexOf(read('src/components/account-widget.tsx'), 'const menuStyle = css`'),
    'the party chat': zIndexOf(read('src/components/party-chat.tsx'), 'const style = css`'),
  }

  // CONTROL. Every assertion below is a comparison, and a comparison against undefined is not a
  // failure in a way anyone would notice. These are the anchors the app has carried for months, so a
  // wrong number here means the reader broke, not that a layer moved.
  test('each layer was actually read', () => {
    expect({ modalLayer, headerLayer, franchiseLayer, promptLayer })
      .toEqual({ modalLayer: 1000, headerLayer: 1100, franchiseLayer: 1200, promptLayer: 2000 })
    expect(cursorLayer, 'the party cursor declares no z-index at all').toBeTypeOf('number')
    for (const [name, layer] of Object.entries(headerBand)) expect(layer, name).toBeTypeOf('number')
  })

  /**
   * The header sits at 1100 so a follower whose host opened a modal can still reach the party pill
   * and stop following. That only ever covered the BUTTON: the menu it opens is a separate layer,
   * and at 150 it opened under the modal, where it was invisible through the overlay's 44% black and
   * took no clicks. The account menu (400) and the party chat (145) were the same shape.
   *
   * Worse than nothing happening: the overlay is ALSO the modal's dismiss target, so the click that
   * missed the control closed the show the user was reading. And party-widget force-opens its menu
   * when the host ends the party, so that notice was delivered to nobody.
   */
  test('what the header opens clears the modal, or the button it hangs off is a promise it breaks', () => {
    for (const [name, layer] of Object.entries(headerBand)) {
      expect(layer!, name).toBeGreaterThan(modalLayer!)
    }
  })

  // and stays WITH the bar rather than above the app: the franchise dialog covers the header on
  // purpose, so it has to cover what the header opens too
  test('and still sits under the dialog that covers the header on purpose', () => {
    for (const [name, layer] of Object.entries(headerBand)) {
      expect(layer!, name).toBeGreaterThan(headerLayer!)
      expect(layer!, name).toBeLessThan(franchiseLayer!)
    }
  })

  /**
   * The party cursor draws where the HOST's hand is, and the host points at whatever is on top. It sat
   * at 140, under every one of these, so a party spent inside a media modal, the layer people browse
   * in, showed no pointer at all.
   *
   * It costs those layers nothing to sit under it: the cursor is `pointer-events: none`, so it takes
   * no click from the dialog it covers.
   */
  test('the party cursor draws over every layer the app puts on the page', () => {
    const below = { modalLayer, headerLayer, franchiseLayer, promptLayer, ...headerBand }
    for (const [name, layer] of Object.entries(below)) {
      expect(cursorLayer!, name).toBeGreaterThan(layer!)
    }
  })

  // FKN's broker docks its own frame over the page at the top of the int range, measured in Chrome on
  // 2026-09-09. It is not stub's to paint over, so the ceiling is real even though nothing here sets it.
  test('and still under the overlay FKN docks over the page', () => {
    expect(cursorLayer!).toBeLessThan(2147483647)
  })
})

describe("the plugin player's frame", () => {
  const source = read('src/components/plugin-player.tsx')
  const sandbox = /sandbox="([^"]+)"/.exec(source)?.[1]?.split(/\s+/) ?? []

  // CONTROL: the two flags the FKN broker refuses to mount without. If these are missing the regex
  // found the wrong thing, since no working build can lack them.
  test('the sandbox attribute was actually read', () => {
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).toContain('allow-same-origin')
  })

  /**
   * Sandbox flags are INHERITED by a nested frame and can only be added to, so this attribute decides
   * what ripple can do two frames down, and ripple cannot ask for any of it back.
   *
   * Without `allow-popups` its player's links ("Open this torrent in Ripple", "Download") did nothing
   * at all: the browser blocks the tab and says so only in the console, which no one is reading.
   * Without `allow-popups-to-escape-sandbox` the tab opens still sandboxed, where a download is
   * blocked and a form submit does nothing. Measured over that frame chain on Chrome 149, 2026-09-09.
   */
  test('a link inside the player can open a tab, and that tab is an ordinary page', () => {
    expect(sandbox).toContain('allow-popups')
    expect(sandbox).toContain('allow-popups-to-escape-sandbox')
  })
})

describe('the header search field', () => {
  const source = read('src/components/header.tsx')
  const block = source.slice(source.indexOf('.search {'), source.indexOf('.actions {', source.indexOf('.search {')))
  const rulesOf = (selector: string) => {
    const from = block.indexOf(`${selector} {`)
    return from < 0 ? '' : block.slice(from, block.indexOf('}', from))
  }

  // CONTROL: the block has to be the search field's, with both children in it.
  test('the search field block was actually read', () => {
    expect(block).toContain('backdrop-filter')
    expect(rulesOf('input')).toContain('font-size')
    expect(rulesOf('svg')).toContain('color')
  })

  /**
   * Measured in Chrome at 1440px before this changed: the pill was 320x38 and its input was 262x19,
   * so HALF the bar's height and both ends of it were the form's own padding. `elementFromPoint` at
   * every inner edge returned the form, which sets no caret, so a click aimed at the field did
   * nothing. Padding on the box around an input is dead space by construction; the input has to carry
   * its own inset for the whole pill to be the target.
   */
  test('the field carries the inset, so the whole pill is the click target', () => {
    const own = block.slice(0, block.indexOf('&:focus-within'))
    expect(own, 'padding on the form is dead space').not.toMatch(/^\s*padding:/m)
    expect(rulesOf('input')).toMatch(/padding:\s*[^;]+;/)
  })

  // the glyph is drawn over the field rather than beside it, so its share of the pill stays a target
  test('and the glyph does not swallow the click that lands on it', () => {
    expect(rulesOf('svg')).toContain('pointer-events: none')
  })
})
