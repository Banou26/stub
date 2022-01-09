import Category from '../category'
import { fetch } from '@mfkn/fkn-lib'
import { GetGenres, GenreHandle, Get, GetLatest, TitleHandle, GetLatestOptions } from '../types'
import { fromUri } from '.'
import { SearchTitle, GetTitle, ReleaseDate } from '..'

export const name = 'MyAnimeList'
export const scheme = 'mal'
export const categories = [Category.ANIME]

const fixOrigin = (url: string) => url.replace(document.location.origin, 'https://myanimelist.net')

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

const getSeasonCardInfo = (elem: HTMLElement): TitleHandle<true> => ({
  id: elem.querySelector<HTMLElement>('[id]')!.id.trim(),
  url: elem.querySelector<HTMLAnchorElement>('.link-title')!.href,
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
      .map(({ textContent, href, parentElement }) => ({
        id: href!.split('/').at(5)!,
        adult: parentElement?.classList.contains('explicit'),
        url: fixOrigin(href),
        name: textContent?.trim()!,
        categories: [Category.ANIME]
      })),
  releaseDates: [{
    language: 'en',
    date: new Date(elem.querySelector('.prodsrc > .info > span:nth-child(1)')!.textContent!.trim())
  }],
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

export const searchTitle: SearchTitle<true> = {
  categories: [Category.ANIME],
  latest: true,
  pagination: true,
  genres: true,
  score: true,
  function: () => getAnimeSeason()
}

export const getTitle: GetTitle<true> = {
  categories: [Category.ANIME],
  function: ({ uri, id }) =>
    void console.log('getAnimeTitle uri', uri) ||
    getAnimeTitle(id ?? fromUri(uri).id)
}

export const getLatest: GetLatest<true> = ({ title, episode }) =>
  title ? getAnimeSeason()
  : episode ? getLatestEpisodes()
  : Promise.resolve([])

const getTitleInfo = (elem: Document): TitleHandle<true> => {
  const dateText =
    [...elem.querySelectorAll('.spaceit_pad > .dark_text')]
      .find(({ textContent }) => textContent === 'Aired:')
      ?.nextSibling
      ?.textContent!

  const startDate =
    new Date(
      dateText
        .split('to')
        .at(0)!
    )

  const endDate =
    dateText?.includes('to')
      ? (
        new Date(
          dateText
            .split('to')
            .at(1)!
        )
      )
      : undefined

  const date: ReleaseDate = {
    language: 'English',
    ...endDate
      ? {
        start: startDate,
        end: endDate
      }
      : {
        date: startDate
      }
  }




  return {
    id: elem.querySelector<HTMLLinkElement>('head > link[rel="canonical"]')!.href.split('/')[4],
    url: elem.querySelector<HTMLLinkElement>('head > link[rel="canonical"]')!.href,
    images: [{
      type: 'poster',
      size: 'medium',
      url: elem.querySelector<HTMLImageElement>('#content > table > tbody > tr > td.borderClass a img')!.dataset.src!
    }],
    names:
      [elem.querySelector('.title-name')!, ...elem.querySelectorAll<HTMLDivElement>('.js-sns-icon-container + br + h2 ~ div:not(.js-sns-icon-container + br + h2 ~ h2 ~ *):not(.js-alternative-titles), .js-alternative-titles > div')]
        .map((elem, i) =>
          i
            ? {
              language: elem?.childNodes[1].textContent?.slice(0, -1)!,
              name: elem?.childNodes[2].textContent?.trim()!
            }
            : {
              language: 'Japanese-English',
              name: elem?.textContent?.trim()!
            }
        ),
    synopses: [{
      language: 'English',
      synopsis: elem.querySelector('[itemprop=description]')?.innerHTML.replaceAll('<br>', '\n').replaceAll('\n\n\n\n', '\n\n')!
    }],
    genres: [],
    releaseDates: [date],
    related: [],
    episodes: [],
    recommended: [],
    tags: [],
    handles: []
  }
}

export const getAnimeTitle = (id: string) =>
  fetch(`https://myanimelist.net/anime/${id}`, { proxyCache: (1000 * 60 * 60 * 5).toString() })
    .then(async res =>
      getTitleInfo(
        new DOMParser()
          .parseFromString(await res.text(), 'text/html')
      )
    )

export const get: Get<true> = ({ uri, id, title, episode }) =>
  void console.log('get uri', uri) ||
  title ? getAnimeTitle(id ?? fromUri(uri).id)
  : episode ? Promise.resolve(undefined)
  : Promise.resolve(undefined)
