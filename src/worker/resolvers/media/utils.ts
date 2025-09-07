import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { LRUCache } from 'lru-cache'

const window = new JSDOM('').window
const DOMParser = window.DOMParser
const purify = DOMPurify(window)

const parseLRUCache = new LRUCache<string, string>({ max: 1000 })

export const _parseTextDescription = (text: string) => {
  const markdown = marked.parse(text, { async: false })
  const purifiedDOM = purify.sanitize(markdown)
  const { textContent } =
    new DOMParser()
      .parseFromString(
        purifiedDOM,
        'text/html'
      )
      .body

  return textContent
}

export const parseTextDescription = (text: string) => {
  const cached = parseLRUCache.get(text)
  if (cached) return cached

  const result = _parseTextDescription(text)
  parseLRUCache.set(text, result)
  return result
}

export const ellipseText = (text: string, length: number) =>
  text.length > length
    ? `${text.slice(0, text.indexOf(' ', length)).replace(/[,.]$/, '')}...`
    : text
