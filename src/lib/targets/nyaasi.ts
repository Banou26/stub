import type { Search, SearchResult } from '.'

import Category from '../category'
import { fetch } from '@banou26/oz-lib'
import { makeUniqueArrayFilter } from '../utils'

const getRowInfo = (elem: HTMLElement) => ({
  link: 
    new URL(
      elem
        .querySelector('td:nth-child(2)')
        ?.querySelector('a')
        ?.getAttribute('href')
        ?.replace('#comments', '')
      ?? '',
      'https://nyaa.si'
    ).href,
  name: (
    elem.querySelector('td:nth-child(2)')?.querySelector('a:nth-child(2)')
    ?? elem.querySelector('td:nth-child(2)')?.querySelector('a')
  )?.getAttribute('title'),
  torrentUrl:
    elem
      .querySelector('td:nth-child(3)')
      ?.querySelector('a:nth-child(1)')
      ?.getAttribute('href'),
  magnet:
    elem
      .querySelector('td:nth-child(3)')
      ?.querySelector('a:nth-child(2)')
      ?.getAttribute('href'),
  size:
    elem
      .querySelector('td:nth-child(4)')
      ?.textContent,
  uploadDate:
    new Date(
      elem
        .querySelector('td:nth-child(5)')
        ?.textContent
      ?? 0
    ),
  seeders:
    Number(
      elem
        .querySelector('td:nth-child(6)')
        ?.textContent
    ),
  leechers:
    Number(
      elem
        .querySelector('td:nth-child(7)')
        ?.textContent
    ),
  downloads:
    Number(
      elem
        .querySelector('td:nth-child(8)')
        ?.textContent
    )
})

export const getAnimeTorrents = ({ search = '' }: { search: string }) =>
  fetch(`https://nyaa.si/?f=0&c=1_2&q=${encodeURIComponent(search)}`)
    .then(async res =>
      [
        ...new DOMParser()
          .parseFromString(await res.text(), 'text/html')
          .querySelectorAll('tr')
      ]
        .slice(1)
        .map(getRowInfo)
    )

export const categories = [Category.ANIME]
