import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

const window = new JSDOM('').window
const DOMParser = window.DOMParser
const purify = DOMPurify(window)

export const parseTextDescription = (text: string) => {
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

export const ellipseText = (text: string, length: number) =>
  text.length > length
    ? `${text.slice(0, text.indexOf(' ', length)).replace(/[,.]$/, '')}...`
    : text
