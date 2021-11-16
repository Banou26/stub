import type { Search, SearchResult } from '.'

import Category from '../category'
import { fetch } from '@mfkn/fkn-lib'
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

const baseURL = 'https://gogoanime.vc/'

export const getAnimeTorrents = async ({ search = '' }: { search: string }) => {
  const searchJson = await (await fetch(`https://ajax.gogo-load.com/site/loadAjaxSearch?${new URLSearchParams({ keyword: search.trim(), id: '-1' }).toString()}`)).json()
  const animeURI =
    new DOMParser()
      .parseFromString(decodeURI(searchJson.content), 'text/html')
      .querySelector('a')
      .href
      .replace('category/', '')
  const [firstElem, ...rest] =
    new DOMParser()
      .parseFromString(await (await fetch(`${baseURL}${animeURI}-episode-1`)).text(), 'text/html')
      .querySelectorAll('.episode_page li a')
  const count = Number((rest.at(-1) ?? firstElem).getAttribute('ep_end'))

  return {
    count
  }
}

export const categories = [Category.ANIME]

