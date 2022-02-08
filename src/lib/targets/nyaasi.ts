import { fetch } from '@mfkn/fkn-lib'

import Category from '../category'
import { Episode, EpisodeHandle, SearchEpisode } from '../types'
import { addTarget } from '.'

export const getBytesFromBiByteString = (s: string) => {
  const [_number, [_unit]] = s.split(' ')
  return Number(_number) * (2 ** ('bkmgt'.indexOf(_unit.toLowerCase()) * 10))
}

type Row = {
  category: NyaaCategory
  english: boolean
  name: string
  link: string
  torrentUrl: string
  magnet: string
  size: number
  uploadDate: Date
  seeders: number
  leechers: number
  downloads: number
}

const nyaaCategories = ['anime', 'audio', 'literature', 'live action', 'pictures', 'software'] as const
type NyaaCategory = typeof nyaaCategories[number]

const stringToNyaaCategory =
  (s: string): NyaaCategory =>
    s
      .split('-')
      .at(0)!
      .trim()
      .toLocaleLowerCase() as NyaaCategory

const getRow = (elem: HTMLElement): Row => ({
  category:
    stringToNyaaCategory(
      elem
        .querySelector('td:nth-child(1)')
        ?.textContent!
    ),
  english:
    elem
      .querySelector('td:nth-child(1) a')
      ?.getAttribute('title')
      ?.trim()
      .includes('English-translated')!,
  link: 
    new URL(
      elem
        .querySelector('td:nth-child(2)')
        ?.querySelector('a')
        ?.getAttribute('href')
        ?.replace('#comments', '')!,
      'https://nyaa.si'
    ).href,
  name:
    (
      elem.querySelector('td:nth-child(2)')?.querySelector('a:nth-child(2)')
      ?? elem.querySelector('td:nth-child(2)')?.querySelector('a')
    )?.getAttribute('title')!,
  torrentUrl:
    elem
      .querySelector('td:nth-child(3)')
      ?.querySelector('a:nth-child(1)')
      ?.getAttribute('href')!,
  magnet:
    elem
      .querySelector('td:nth-child(3)')
      ?.querySelector('a:nth-child(2)')
      ?.getAttribute('href')!,
  size:
    getBytesFromBiByteString(
      elem
        .querySelector('td:nth-child(4)')
        ?.textContent!
    ),
  uploadDate:
    new Date(
      elem
        .querySelector('td:nth-child(5)')
        ?.textContent!
    ),
  seeders:
    Number(
      elem
        .querySelector('td:nth-child(6)')
        ?.textContent!
    ),
  leechers:
    Number(
      elem
        .querySelector('td:nth-child(7)')
        ?.textContent!
    ),
  downloads:
    Number(
      elem
        .querySelector('td:nth-child(8)')
        ?.textContent!
    )
})

const resolutions = [480, 540, 720, 1080, 1440, 2160, 4320] as const
type Resolution = typeof resolutions[number]
const releaseType = ['bd' /*Blu-ray disc*/, 'web', 'web-dl', 'hd', 'hc' /*Hardcoded subs*/, 'vod', 'cam', 'tv'] as const
type ReleaseType = typeof releaseType[number]

// todo: add all release types https://nyaa.si/rules & https://en.wikipedia.org/wiki/Pirated_movie_release_types
const getReleaseType = (s: string): ReleaseType | undefined =>
  ['WEBDL', 'WEB DL', 'WEB-DL', 'WEB', 'WEBRip', 'WEB Rip', 'WEB-Rip', 'WEB-DLRip', 'HDRip', 'WEB Cap', 'WEBCAP', 'WEB-Cap', 'HD-Rip'].some(type => s.toLowerCase().includes(type.toLocaleLowerCase())) ? 'web-dl' :
  ['Blu-Ray', 'BluRay', 'BLURAY', 'BDRip', 'BRip', 'BRRip', 'BDR', 'BD25', 'BD50', 'BD5', 'BD9', 'BDMV', 'BDISO', 'COMPLETE.BLURAY'].some(type => s.toLowerCase().includes(type.toLocaleLowerCase())) ? 'bd' :
  undefined

type TitleMetadata = {
  name: string
  group?: string
  batch: boolean
  resolution?: Resolution
  type?: ReleaseType
}

// todo: implement parser to get better results instead of using regex, test samples:
// [JacobSwaggedUp] Kara no Kyoukai 7: Satsujin Kousatsu (Kou) | The Garden of Sinners Chapter 7: Murder Speculation Part B (BD 1280x720) [MP4 Movie]
// [Judas] Kimetsu no Yaiba (Demon Slayer) - Yuukaku-hen - S03E09 (Ep.42) [1080p][HEVC x265 10bit][Multi-Subs] (Weekly)
// [SubsPlease] Mushoku Tensei (01-23) (1080p) [Batch]
// [SubsPlease] Mushoku Tensei - 23 (1080p) [63077C59].mkv
// [Erai-raws] Mushoku Tensei - Isekai Ittara Honki Dasu 2nd Season - 12 END [v0][1080p][Multiple Subtitle][E500D275].mkv
// [Erai-raws] Mushoku Tensei - Isekai Ittara Honki Dasu 2nd Season - 11 [v0][1080p][Multiple Subtitle][9B808EC3].mkv
// [MTBB] Mushoku Tensei – Jobless Reincarnation - Volume 3 (BD 1080p)
// [MTBB] Mushoku Tensei – Jobless Reincarnation - Volume 2 (v2) (BD 1080p)
// [MTBB] Mushoku Tensei – Jobless Reincarnation - 23

const getTitleFromTrustedTorrentName = (s: string): TitleMetadata => {
  const regex = /^(\[.*?\])?\s*?(.*?)(?:\s*?(\(.*\))|(\[.*\])|(?:\s*?))*?\s*?(\.\w+)?$/
  const [, group, name] = regex.exec(s)
  const meta = s.replace(group, '').replace(name, '')
  const batch = s.toLocaleLowerCase().includes('batch')
  const resolution = resolutions.find(resolution => s.includes(resolution.toString()))
  return {
    name,
    group: group?.slice(1, -1),
    meta,
    batch,
    resolution,
    type: getReleaseType(s)
  }
}

export const getRowAsEpisode = (elem: HTMLElement): EpisodeHandle => {
  const row = getRow(elem)

  const { name, group, meta, batch, resolution, type } = getTitleFromTrustedTorrentName(row.name)
  const number = Number(/((0\d)|(\d{2,}))/.exec(name)?.[1] ?? 1)
  console.log('getRowAsEpisode', group, '||', name, '||', meta, '||', batch, '||', resolution, '||', type, '||', number)


  return {
    id: row.link.split('/').at(4)!,
    scheme: 'nyaa',
    categories: row.category === 'anime' ? [Category.ANIME] : [],
    names: [{ language: row.english ? 'en' : '', name }],
    season: 1,
    number,
    images: [],
    releaseDates: [],
    synopses: [],
    handles: [],
    tags: [],
    related: [],
    url: row.link
    // type: getReleaseType(row.name),
    // meta
  }
}

export const getAnimeTorrents = async ({ search = '' }: { search: string }) => {
  const trustedSources = true
  const pageHtml = await (await fetch(`https://nyaa.si/?f=${trustedSources ? 2 : 0}&c=1_2&q=${encodeURIComponent(search)}`, { proxyCache: (1000 * 60 * 60 * 5).toString() })).text()
  const dom =
    new DOMParser()
      .parseFromString(pageHtml, 'text/html')
  const cards =
    [...dom.querySelectorAll('tr')]
      .slice(1)
      .map(getRowAsEpisode)
  const [, count] =
    dom
      .querySelector('.pagination-page-info')!
      .textContent!
      .split(' ')
      .reverse()
  return {
    count: Number(count),
    items: cards
  }
  // console.log('cards', cards)
  // return cards
}

export const _searchEpisode = async ({ search = '', ...rest }: { search: string }): Promise<EpisodeHandle[]> => {
  console.log('nya searchEpisode', search, rest)
  const trustedSources = true
  const pageHtml = await (await fetch(`https://nyaa.si/?f=${trustedSources ? 2 : 0}&c=1_2&q=${encodeURIComponent(search)}`, { proxyCache: (1000 * 60 * 60 * 5).toString() })).text()
  const dom =
    new DOMParser()
      .parseFromString(pageHtml, 'text/html')
  const cards =
    [...dom.querySelectorAll('tr')]
      .slice(1)
      .map(getRowAsEpisode)
  console.log('dom.querySelectorAll(asdasd)', [...dom.querySelectorAll('tr')].slice(1))
  // const [, count] =
  //   dom
  //     .querySelector('.pagination-page-info')!
  //     .childNodes[0]
  //     .textContent!
  //     .split(' ')
  //     .reverse()

  

  // return {
  //   count: Number(count),
  //   items: cards
  // }
  console.log('cards', cards)
  return cards
}

export const categories = [Category.ANIME]

// export const getAnimeEpisode = (id: string, episode: number) =>
//   fetch(`https://myanimelist.net/anime/${id}/${id}/episode/${episode}`, { proxyCache: (1000 * 60 * 60 * 5).toString() })
//     .then(async res =>
//       getTitleEpisodeInfo(
//         new DOMParser()
//           .parseFromString(await res.text(), 'text/html')
//       )
//     )


// export const getEpisode: GetEpisode<true> = {
//   scheme: 'nyaa',
//   categories: [Category.ANIME],
//   function: (args) => console.log('getEpisode nyaa args', args)
//     // getAnimeEpisode(fromUri(uri!).id.split('-')[0], Number(fromUri(uri!).id.split('-')[1]))
// }

addTarget({
  name: 'Nyaa.si',
  scheme: 'nyaa',
  categories: [Category.ANIME],
  searchEpisode: {
    scheme: 'nyaa',
    categories: [Category.ANIME],
    latest: true,
    pagination: true,
    genres: true,
    score: true,
    function: (args) => _searchEpisode(args)
  }
})
