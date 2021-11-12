import type { Search, SearchResult } from '.'

import Category from '../category'
import { fetch, evalFetch } from '@banou26/oz-lib'
import { makeUniqueArrayFilter } from '../utils'

const getCardInfo = (elem: HTMLElement) => ({
  MALId: Number(elem.querySelector('[id]').id),
  image: (<HTMLElement>elem.querySelector('img'))?.dataset.src ?? (<HTMLElement>elem.querySelector('img'))?.getAttribute('src'),
  name: elem.querySelector('.h2_anime_title')?.textContent?.trim()
})

export const getAnimeSeason = () =>
  fetch('https://myanimelist.net/anime/season', { proxyCache: (1000 * 60 * 60 * 5).toString() })
    .then(async res =>
      [
        ...new DOMParser()
          .parseFromString(await res.text(), 'text/html')
          .querySelectorAll('.seasonal-anime.js-seasonal-anime')
      ]
        .map(getCardInfo)
    )

export const categories = [Category.ANIME]
