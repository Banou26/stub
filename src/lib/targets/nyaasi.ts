import { fetch } from '@mfkn/fkn-lib'

import Category from '../category'

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

export const getAnimeTorrents = async ({ search = '' }: { search: string }) => {
  const pageHtml = await (await fetch(`https://nyaa.si/?f=0&c=1_2&q=${encodeURIComponent(search)}`)).text()
  const dom =
    new DOMParser()
      .parseFromString(pageHtml, 'text/html')
  const cards =
    [...dom.querySelectorAll('tr')]
      .slice(1)
      .map(getRowInfo)
  const [, count] =
    dom
      .querySelector('.pagination-page-info')!
      .textContent!
      .split(' ')
      .reverse()
  return {
    count: Number(count),
    items: cards
  }
}

export const categories = [Category.ANIME]
