import type { Search, SearchResult } from '.'

import Category from '../category'
import { fetch } from '@banou26/oz-lib'
import { makeUniqueArrayFilter } from '../utils'

const findUniqueGoogleResults = makeUniqueArrayFilter<SearchResult>(({ name }) => name)

const getCardInfos = (elem: HTMLElement) => ({
  image: (<HTMLElement>elem.querySelector('img'))?.dataset.src,
  name: elem.querySelector('[role="heading"]')?.textContent?.trim()
})

export const getLatest: Search = () =>
  fetch(
    'https://encrypted.google.com/search?q=latest+movies&hl=en&gl=en#safe=active&hl=en&gl=en&q=%s',
    {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'dnt': '1',
        'pragma': 'no-cache',
        'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="90", "Google Chrome";v="90"',
        'sec-ch-ua-mobile': '?0',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': navigator.userAgent
      },
      "referrer": "https://www.google.com/"
    }
  )
    .then(async res => {
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
      const movieElements = [...doc.querySelectorAll('[data-item-card="true"]')]
      const movieNames = movieElements.map(getCardInfos)

      const scriptElements = [...doc.querySelectorAll('script')]
      const moviesScriptElement = scriptElements.find(elem => elem.textContent?.includes('window.jsl.dh'))

      const results =
        Array
          .from(
            moviesScriptElement
              ?.innerText
              ?.matchAll(/window\.jsl\.dh\('.*?','(.*?)'\);/gm)
            ?? []
          )
          .map(escapedString =>
            escapedString[1].replaceAll(
              /\\x../gm,
              hex =>
                String.fromCharCode(
                  parseInt(
                    Number(`0x${hex.slice(2)}`).toString(),
                    10
                  )
                )
            )
          )
          .flatMap(str => [
            ...new DOMParser()
              .parseFromString(str, 'text/html')
              .querySelectorAll('[data-item-card="true"]')
          ])
          .map(getCardInfos)
          .filter(({ name }) => name)

      return findUniqueGoogleResults([...movieNames, ...results] as unknown as SearchResult[])
  })

export const categories = [Category.MOVIE]
