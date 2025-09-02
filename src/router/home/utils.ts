import { marked } from 'marked'
import DOMPurify from 'dompurify'

export const parseTextDescription = (text: string | undefined) =>
  text &&
  new DOMParser()
    .parseFromString(
      DOMPurify.sanitize(
        marked.parse(text, { async: false })
      ),
      'text/html'
    )
    .body
    .innerText

export const getEllipsedDescription = (text: string | undefined) =>
  text &&
  text.length > 225
    ? `${text.slice(0, text.indexOf(' ', 225)).replace(/[,.]$/, '')}...`
    : text
