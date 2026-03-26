import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { parseHTML } from 'linkedom'
import { LRUCache } from 'lru-cache'

const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>')
const purify = DOMPurify(window as any)

const innerHTMLCache = new LRUCache<string, string>({ max: 1000 })
const textContentCache = new LRUCache<string, string>({ max: 1000 })
const markdownLRUCache = new LRUCache<string, string>({ max: 1000 })

const parseMarkdown = (text: string) => {
  const cached = markdownLRUCache.get(text)
  if (cached) return cached

  const markdown = marked.parse(text, { async: false })
  markdownLRUCache.set(text, markdown)
  return purify.sanitize(markdown)
}

const parseDOM = (html: string) => {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`)
  return {
    innerHTML: document.body?.innerHTML ?? html,
    textContent: document.body?.textContent ?? html,
  }
}

export const parseHTMLDescription = (text: string) => {
  const cached = innerHTMLCache.get(text)
  if (cached) return cached

  const purifiedDOM = parseMarkdown(text)
  const { innerHTML, textContent } = parseDOM(purifiedDOM)

  textContentCache.set(text, textContent)
  innerHTMLCache.set(text, innerHTML)

  return innerHTML
}

export const parseTextDescription = (text: string) => {
  const cached = textContentCache.get(text)
  if (cached) return cached

  const purifiedDOM = parseMarkdown(text)
  const { innerHTML, textContent } = parseDOM(purifiedDOM)

  textContentCache.set(text, textContent)
  innerHTMLCache.set(text, innerHTML)

  return textContent
}
