import type { Search, SearchResult } from '.'

import Category from '../category'
import { fetch } from '@oz/package-api'
import { makeUniqueArrayFilter } from '../utils'


const getAnimeSeason = () =>
  fetch('https://www.livechart.me/winter-2021/tv')

getAnimeSeason().then(v => console.log(v))

export const categories = [Category.ANIME]
