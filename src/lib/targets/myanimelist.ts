import Category from '../category'
import { fetch } from '@mfkn/fkn-lib'

export const name = 'MyAnimeList'

export const getGenres = () =>
  fetch('https://myanimelist.net/anime.php', { proxyCache: (1000 * 60 * 60 * 5).toString() })
    .then(res => res.text())
    .then(text =>
      [
        ...new DOMParser()
        .parseFromString(text, 'text/html')
        .querySelectorAll('.genre-link')
      ]
        .slice(0, 2)
        .flatMap((elem, i) =>
          [...elem.querySelectorAll<HTMLAnchorElement>('.genre-name-link')]
            .map(({ href, textContent }) => ({
              adult: !!i,
              href,
              name: textContent?.replace(/(.*) \(.*\)/, '$1')
            }))
        )
    )

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
