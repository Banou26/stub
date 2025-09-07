import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { LRUCache } from 'lru-cache'

const window = new JSDOM('').window
const DOMParser = window.DOMParser
const purify = DOMPurify(window)

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

export const parseHTMLDescription = (text: string) => {
  const cached = innerHTMLCache.get(text)
  if (cached) return cached

  const purifiedDOM = parseMarkdown(text)
  const { innerHTML, textContent } =
    new DOMParser()
      .parseFromString(
        purifiedDOM,
        'text/html'
      )
      .body

  textContentCache.set(text, textContent)
  innerHTMLCache.set(text, innerHTML)

  return textContent
}

export const parseTextDescription = (text: string) => {
  const cached = textContentCache.get(text)
  if (cached) return cached

  const purifiedDOM = parseMarkdown(text)
  const { innerHTML, textContent } =
    new DOMParser()
      .parseFromString(
        purifiedDOM,
        'text/html'
      )
      .body

  textContentCache.set(text, textContent)
  innerHTMLCache.set(text, innerHTML)

  return textContent
}
