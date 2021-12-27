import Category from '../category'
import { fetch } from '@mfkn/fkn-lib'
import { GetGenres, GenreHandle, GetLatest, TitleHandle, GetLatestOptions } from '../types'

export const name = 'MyAnimeList'
export const scheme = 'mal'
export const categories = [Category.ANIME]

export const getGenres: GetGenres<true> = () =>
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
            .map(({ href, textContent }): GenreHandle<true> => ({
              id: href!.split('/').at(5)!,
              url: href,
              adult: !!i,
              name: textContent!.replace(/(.*) \(.*\)/, '$1')!,
              categories: [Category.ANIME]
            }))
            .filter(({ name }) => name)
        )
    )

const getSeasonCardInfo = (elem: HTMLElement): TitleHandle<true> => void console.log(elem) || ({
  id: elem.querySelector<HTMLElement>('[id]')!.id.trim(),
  url: elem.querySelector<HTMLAnchorElement>('.link-title')!.href,
  // url: elem.querySelector('.link-title')!.textContent!.trim(),
  images: [{
    type: 'poster',
    size: 'medium',
    url: elem.querySelector<HTMLImageElement>('img')!.src || elem.querySelector<HTMLImageElement>('img')!.dataset.src!
  }],
  names: [{
    language: 'en',
    name: elem.querySelector('.h2_anime_title')!.textContent!.trim()!
  }],
  synopses: [{
    language: 'en',
    synopsis: elem.querySelector('.preline')!.textContent!.trim()!
  }],
  genres:
    [...elem.querySelectorAll<HTMLAnchorElement>('.genre a')]
      .map(({ textContent, href }) => ({
        id: href!.split('/').at(5)!,
        url: href,
        name: textContent?.trim()!,
        categories: [Category.ANIME]
      })),
  releaseDate: [new Date(elem.querySelector('.remain-time')!.textContent!.trim().replace('(JST)', 'UTC+9'))],
  related: [],
  episodes: [],
  recommended: [],
  tags: []
})

export const getAnimeSeason = () =>
  fetch('https://myanimelist.net/anime/season', { proxyCache: (1000 * 60 * 60 * 5).toString() })
    .then(async res =>
      [
        ...new DOMParser()
          .parseFromString(await res.text(), 'text/html')
          .querySelectorAll('.seasonal-anime.js-seasonal-anime')
      ]
        .map(getSeasonCardInfo)
    )

const getEpisodeCardInfo = (elem: HTMLElement): TitleHandle<true> => ({
  id: elem.querySelector<HTMLElement>('[data-anime-id]')!.dataset.animeId!,
  url: elem.querySelector<HTMLAnchorElement>('.video-info-title a:last-of-type')!.href,
  images: [{
    type: 'poster',
    size: 'medium',
    url: elem.querySelector<HTMLImageElement>('img')!.src
  }],
  names: [{
    language: 'en',
    name: elem.querySelector('.mr4')!.textContent!.trim()
  }],
  synopses: [],
  genres: [],
  releaseDate: [],
  related: [],
  episodes:
    [...elem.querySelectorAll<HTMLAnchorElement>('.title a')]
      .map(elem => ({
        id: `${elem.href.split('/')[4]}-${elem.href.split('/')[7]}`,
        url: elem.href,
        names: [],
        images: [],
        synopses: [],
        related: [],
        tags: [],
        releaseDate: []
      })),
  recommended: [],
  tags: []
})

const getLatestEpisodes = () =>
  fetch('https://myanimelist.net/watch/episode')
    .then(async res =>
      [
        ...new DOMParser()
          .parseFromString(await res.text(), 'text/html')
          .querySelectorAll('.video-list-outer-vertical')
      ]
        .map(getEpisodeCardInfo)
    )

export const getLatestOptions: GetLatestOptions = {
  categories: [Category.ANIME],
  title: {
    pagination: true,
    title: true,
    genres: true,
    score: true
  },
  episode: {
    pagination: false
  },
  genre: {
    pagination: false
  }
}

export const getLatest: GetLatest<true> = ({ title, episode }) =>
  title ? getAnimeSeason()
  : episode ? getLatestEpisodes()
  : Promise.resolve([])
