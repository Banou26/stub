import type { Category } from '../../../../../scannarr/src'

import AnimeCategory from './anime'

export default ({ category }: { category?: Category }) => {
  if (category === 'ANIME') return <AnimeCategory category={category}/>
}
