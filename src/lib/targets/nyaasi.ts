import { fetch } from '@mfkn/fkn-lib'

import Category from '../category'
import { Episode, EpisodeHandle, Impl, Name, SearchEpisode, Team, TeamEpisode } from '../types'
import { addTarget } from '.'
import { getBytesFromBiByteString } from '../utils/bytes'
import { flow, pipe } from 'fp-ts/lib/function'
import * as A from 'fp-ts/lib/Array'
import { join } from 'fp-ts-std/Array'

type Item = {
  category: NyaaCategory
  english: boolean
  name: string
  link: string
  torrentUrl: string
  magnet?: string
  size: number
  uploadDate: Date
  seeders: number
  leechers: number
  downloads: number
}

const nyaaCategories = ['anime', 'audio', 'literature', 'live action', 'pictures', 'software'] as const
type NyaaCategory = typeof nyaaCategories[number]

const teams: Map<string, Promise<Team>> = new Map()

const addTeam = (tag: string, team: Promise<Team>) => teams.set(tag, team).get(tag)

const removeTeam = (tag) => teams.delete(tag)

const getTeam = (tag: string) => teams.get(tag)

const stringToNyaaCategory =
  (s: string): NyaaCategory =>
    s
      .split('-')
      .at(0)!
      .trim()
      .toLocaleLowerCase() as NyaaCategory

const getItem = (elem: HTMLElement): Item => ({
  category:
    stringToNyaaCategory(
      elem
        .querySelector('category')
        ?.textContent!
    ),
  english:
    elem
      .querySelector('category')
      ?.textContent
      ?.trim()
      .includes('English-translated')!,
  link:
    elem
      .querySelector('guid')
      ?.textContent!,
  name:
    elem
      .querySelector('title')
      ?.textContent!,
  torrentUrl:
    elem
      .querySelector('link')
      ?.textContent!,
  // magnet:
  //   elem
  //     .querySelector('td:nth-child(3)')
  //     ?.querySelector('a:nth-child(2)')
  //     ?.getAttribute('href')!,
  size:
    getBytesFromBiByteString(
      elem
        .querySelector('size')
        ?.textContent!
    ),
  uploadDate:
    new Date(
      elem
        .querySelector('pubDate')
        ?.textContent!
    ),
  seeders:
    Number(
      elem
        .querySelector('seeders')
        ?.textContent!
    ),
  leechers:
    Number(
      elem
        .querySelector('leechers')
        ?.textContent!
    ),
  downloads:
    Number(
      elem
        .querySelector('downloads')
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
  const [, group, name] = regex.exec(s) ?? []
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

const getTorrentAsEpisodeAndTeam = async (tag, url: string): Promise<[TeamEpisode, Team]> => {
  const teamPromise = new Promise<[TeamEpisode['url'], Team]>(async resolve => {
    const pageHtml = await (await fetch(url, { proxyCache: (1000 * 60 * 60 * 5).toString() })).text()
    const doc =
      new DOMParser()
        .parseFromString(pageHtml, 'text/html')
    const informationUrl = doc.querySelector<HTMLAnchorElement>('[rel="noopener noreferrer nofollow"]')?.href
    const informationPageFavicon =
      await (
        informationUrl
          ? (
            fetch(informationUrl, { proxyCache: (1000 * 60 * 60 * 5).toString() })
              .then(res => res.text())
              .then(informationPageHtml => {
                const doc =
                  new DOMParser()
                    .parseFromString(informationPageHtml, 'text/html')
                const iconPath = doc.querySelector<HTMLLinkElement>('link[rel*="icon"]')?.href
                if (!iconPath) return undefined
                const faviconUrl = new URL(new URL(iconPath).pathname, new URL(informationUrl).origin).href
                if (!faviconUrl) return undefined
                // todo: check if this causes any issues or if we cant just keep doing that (mostly in terms of image format support)
                // return faviconUrl
                return (
                  fetch(faviconUrl, { proxyCache: (1000 * 60 * 60 * 5).toString() })
                    .then(res => res.blob())
                    .then(blob => URL.createObjectURL(blob))
                )
              })
          )
          : Promise.resolve(undefined)
      ).catch(() => undefined)
    const team = {
      tag,
      url: informationUrl ? new URL(informationUrl).origin : undefined,
      icon: informationPageFavicon,
      name: doc.querySelector<HTMLAnchorElement>('body > div > div.panel.panel-success > div.panel-body > div:nth-child(2) > div:nth-child(2) > a')?.textContent ?? undefined
    }
    resolve([informationUrl, team])
  })
  addTeam(tag, teamPromise.then(res => res[1]))
  const [informationUrl, team] = await teamPromise
  return [
    {
      url: informationUrl
    },
    team
  ] as [TeamEpisode, Team]
}

export const getItemAsEpisode = async (elem: HTMLElement): Promise<Impl<EpisodeHandle>> => {
  const row = getItem(elem)
  // console.log(row)
  const { name, group: groupTag, meta, batch, resolution, type } = getTitleFromTrustedTorrentName(row.name)
  const number = Number(/((0\d)|(\d{2,}))/.exec(name)?.[1] ?? 1)

  const existingTeam = groupTag ? getTeam(groupTag) : undefined
  const [teamEpisode, team] = existingTeam ? [undefined, await existingTeam] : await getTorrentAsEpisodeAndTeam(groupTag, row.link)

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
    url: row.link,
    type: 'torrent',
    resolution,
    size: row.size,
    teamEpisode: {
      url: undefined,
      ...teamEpisode,
      team: (await team)!
    },
    batch
    // type: getReleaseType(row.name),
    // meta
  }
}

export const getAnimeTorrents = async ({ search = '' }: { search: string }) => {
  const trustedSources = true
  const pageHtml = await (await fetch(`https://nyaa.si/?page=rss&f=${trustedSources ? 2 : 0}&c=1_2&q=${encodeURIComponent(search)}`, { proxyCache: (1000 * 60 * 60 * 5).toString() })).text()
  const doc =
    new DOMParser()
      .parseFromString(pageHtml, 'text/xml')
  const cards =
    Promise.all(
      [...doc.querySelectorAll('item')]
        .map(getItemAsEpisode)
    )
  const [, count] =
    doc
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

export const _searchEpisode = async ({ titles, season, number, ...rest }: { titles: Name[], season?: number, number?: number, batch?: boolean }): Promise<EpisodeHandle[]> => {
  const trustedSources = true

  // todo: check if names containing parenthesis will cause problems with nyaa.si search engine
  const search =
    pipe(
      titles,
      A.filter(({ search }) => Boolean(search)),
      A.map(({ name }) => name),
      A.map((name) => `${name} ${number ? number.toString().padStart(2, '0') : ''}`),
      A.map((episodeName) => `(${episodeName})`),
      join('|')
    )

  // const search = `${mostCommonSubnames ? mostCommonSubnames : title.names.find((name) => name.language === 'ja-en')?.name} ${number ? number.toString().padStart(2, '0') : ''}`

  const pageHtml = await (await fetch(`https://nyaa.si/?page=rss&f=${trustedSources ? 2 : 0}&c=1_2&q=${encodeURIComponent(search)}`, { proxyCache: (1000 * 60 * 60 * 5).toString() })).text()
  const doc =
    new DOMParser()
      .parseFromString(pageHtml, 'text/xml')
  const episodes =
    await Promise.all(
      [...doc.querySelectorAll('item')]
        .map(getItemAsEpisode)
    )

  // const Team = {
  //   EqByTag: {
  //     equals: (teamX: Team, teamY: Team) => teamX.tag === teamY.tag
  //   }
  // }
  
  // const findNewTeams =
  //   (episodes: Impl<EpisodeHandle>[]) =>
  //     (teams: Team[]) =>
  //       pipe(
  //         episodes,
  //         A.filter<Impl<EpisodeHandle> & { teamEpisode: TeamEpisode }>((ep: Impl<EpisodeHandle>) => !!ep.teamEpisode.team),
  //         A.filter((ep) => !A.elem(Team.EqByTag)(ep.teamEpisode.team)(teams)),
  //         A.map(ep => ep.teamEpisode.team),
  //         A.uniq(Team.EqByTag)
  //       )

  // const newTeams = findNewTeams(episodes)(await Promise.all(teams.values()))
  // console.log('newTeams', newTeams)

  return episodes
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
  },
  icon: 'https://nyaa.si/static/favicon.png'
})
