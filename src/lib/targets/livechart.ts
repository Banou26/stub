import type { Search, SearchResult } from '.'

import Category from '../category'
import { fetch } from '@banou26/oz-lib'
import { makeUniqueArrayFilter } from '../utils'


const getAnimeSeason = () =>
  fetch('https://www.livechart.me/winter-2021/tv')

// getAnimeSeason().then(v => console.log(v))

const getLCCardInfo = (elem: HTMLElement) => ({
  MALId: Number(elem.querySelector('[id]').id),
  image: (<HTMLElement>elem.querySelector('poster-container img'))?.dataset.src ?? (<HTMLElement>elem.querySelector('img'))?.getAttribute('src'),
  name: elem.querySelector('.main-title')?.textContent?.trim()
})

export const getLCAnimeSeason = () =>
  void console.log('AAAAAAAAAAAAAAAAA')
  // || evalFetch('https://www.livechart.me/')
  //   .then(async res =>
  //     [
  //       ...new DOMParser()
  //         .parseFromString(await res.text(), 'text/html')
  //         .querySelectorAll('.anime-card')
  //     ]
  //       .map(getLCCardInfo)
  //   )

export const categories = [Category.ANIME]
