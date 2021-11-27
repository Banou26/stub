import type { Search, SearchResult } from '.'

import Category from '../category'
import { fetch, evalFetch } from '@mfkn/fkn-lib'
import { makeUniqueArrayFilter } from '../utils'

const getCardInfo = (elem: HTMLElement) => ({
  protocol: 'mal',
  id: elem.querySelector('[id]')?.id,
  url: elem.querySelector('link-title')?.textContent?.trim() ?? undefined,
  image: (<HTMLElement>elem.querySelector('img'))?.dataset.src ?? (<HTMLElement>elem.querySelector('img'))?.getAttribute('src') ?? undefined,
  name: elem.querySelector('.h2_anime_title')?.textContent?.trim() ?? undefined
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
        .filter(({ url, image, name }) => url && image && name)
    )

export const getLatest = getAnimeSeason

export const categories = [Category.ANIME]
