import type { Search, SearchResult } from '.'

import Category from '../category'
import { fetch } from '@oz/package-api'
import { makeUniqueArrayFilter } from '../utils'

const getCardInfo = (elem: HTMLElement) => ({
  image: (<HTMLElement>elem.querySelector('img'))?.dataset.src ?? (<HTMLElement>elem.querySelector('img'))?.getAttribute('src'),
  name: elem.querySelector('.h2_anime_title')?.textContent?.trim()
})

export const getAnimeSeason = () =>
  fetch('https://myanimelist.net/anime/season')
    .then(async res =>
      [
        ...new DOMParser()
          .parseFromString(await res.text(), 'text/html')
          .querySelectorAll('.seasonal-anime.js-seasonal-anime')
      ]
        .map(getCardInfo)
    )

export const categories = [Category.ANIME]
