import { useLocation, useParams, useSearch } from 'wouter'

import { css } from '@emotion/react'
import { useEffect, useMemo, useState } from 'react'
import { hex2bin } from 'uint8-util'
import { Buffer } from 'buffer'
import Bencode from 'bencode'
import parseTorrent from 'parse-torrent'
import { useQuery } from 'urql'
import { Uri, mergeScannarrUris, fromUriEpisodeId } from 'scannarr/src/utils/uri2'

import { fetch } from '../../utils/fetch'
import { Route, getRoutePath } from '../path'
import SourcesModal, { getTeamIcon } from './sources-modal'

const style = css`
  display: grid;
  height: 100%;
  width: 100%;
  grid-template-rows: 100% auto;

  iframe {
    height: 100%;
    width: 100%;
  }

  .description {
    background: rgb(35, 35, 35);
    text-align: center;
    padding: 2.5rem;
    margin: 1.5rem auto;
    margin-bottom: 0;
    width: 150rem;
    white-space: pre-line;
  }

  .comments {
    display: grid;
    margin: 5rem auto;

    .header {
      text-align: center;
      padding: 2.5rem;
    }

    .comment {
      display: grid;
      grid-template-columns: auto 1fr;
      margin: 1.5rem auto;
      width: 150rem;
      padding: 1rem;
      background: rgb(35, 35, 35);
      overflow: hidden;

      .avatar {
        height: 12rem;
        width: 12rem;
        margin-right: 2.5rem;
      }
      .date {
        margin-left: 2.5rem;
      }
      .message {
        margin-top: 1.5rem;
        white-space: pre-line;
      }
    }
  }

`


export const GET_PLAYBACK_SOURCES = `#graphql
  fragment PlaybackSourceFragment on PlaybackSource {
    origin
    id
    uri
    url

    type
    filename
    title {
      romanized
      english
      native
    }
    structure
    filesCount
    bytes
    uploadDate
    thumbnails
    team {
      origin
      id
      uri
      url
      name
    }
    resolution
    hash
    format
    episodeRange
    data
  }

  query GetPlaybackSources($uri: String, $origin: String, $id: String, $search: String, $name: String, $resolution: String, $season: Int, $number: Float) {
    Page {
      playbackSource(uri: $uri, origin: $origin, id: $id, search: $search, name: $name, resolution: $resolution, season: $season, number: $number) {
        handles {
          edges @stream {
            node {
              handles {
                edges {
                  node {
                    origin
                    id
                    uri
                    url
                  }
                }
              }
              ...PlaybackSourceFragment
            }
          }
        }
        ...PlaybackSourceFragment
      }
    }
  }
`


export const GET_WATCH_MEDIA = `#graphql
  fragment GetWatchMediaEpisodeFragment on Episode {
    origin
    id
    uri
    url

    airingAt
    number
    mediaUri
    timeUntilAiring
    thumbnail
    title {
      romanized
      english
      native
    }
    description
  }

  fragment GetWatchMediaFragment on Media {
    origin
    id
    uri
    url
    title {
      romanized
      english
      native
    }
    bannerImage
    coverImage {
      color
      default
      extraLarge
      large
      medium
      small
    }
    description
    shortDescription
    season
    seasonYear
    popularity
    averageScore
    episodeCount
    trailers {
      origin
      id
      uri
      url
      thumbnail
    }
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    episodes {
      edges {
        node {
          ...GetWatchMediaEpisodeFragment
        }
      }
    }
  }

  query GetWatchMedia($uri: String!, $origin: String, $id: String) {
    Media(uri: $uri, origin: $origin, id: $id) {
      handles {
        edges @stream {
          node {
            handles {
              edges {
                node {
                  origin
                  id
                  uri
                  url
                }
              }
            }
            ...GetWatchMediaFragment
          }
        }
      }
      ...GetWatchMediaFragment
    }
  }
`


const Watch = () => {
  const { mediaUri, episodeUri, sourceUri } = useParams() as { mediaUri: Uri, episodeUri: Uri, sourceUri?: Uri }
  const [location, setLocation] = useLocation()
  const setSearchParams =
    (init?: string | string[][] | Record<string, string> | URLSearchParams | undefined) =>
      setLocation(`${location}?${new URLSearchParams(init).toString()}`)
  const uri = mergeScannarrUris([mediaUri, episodeUri])
  const episodeId = fromUriEpisodeId(episodeUri).episodeId

  const [{ data: { Media: media } = { Media: undefined } }] = useQuery({
    query: GET_WATCH_MEDIA,
    variables: { uri: mediaUri! },
    pause: !mediaUri
  })

  // console.log('media', media)
  // console.log('episodeId', episodeId)

  const [{ error, data: { Page } = { Page: undefined } }] = useQuery(
    {
      query: GET_PLAYBACK_SOURCES,
      variables: { uri, number: Number(episodeId) },
      pause: !uri
    }
  )

  // console.log('Page', Page)

  // console.log('mediaUri', mediaUri && mediaUri.replace('scannarr:', ''))
  // console.log('episodeUri', episodeUri && episodeUri.replace('scannarr:', ''))
  // console.log('sourceUri', sourceUri && sourceUri?.replace('scannarr:', ''))

  const currentSource = useMemo(
    () => Page?.playbackSource?.find((source) => source.uri === sourceUri),
    [Page?.playbackSource, sourceUri]
  )

  const currentSourceObject = useMemo(
    () => currentSource && JSON.parse(currentSource?.data),
    [currentSource]
  )
  
  // console.log('currentSource', currentSource)

  useEffect(() => {
    if (!(currentSource && currentSource.uri !== sourceUri)) return
    setSearchParams({ details: currentSource.uri }, { replace: true })
  }, [currentSource, sourceUri])

  const [trackerData, setTrackerData] = useState(new Map())

  const torrentSourcesInfoHashes = useMemo(
    () =>
      Page
        ?.playbackSource
        ?.map((source) => {
          try {
            const parsedTorrent = parseTorrent(JSON.parse(source?.data).magnetUri)
            const binStr = hex2bin(parsedTorrent.infoHash)
            return [source.uri, binStr, Buffer.from(parsedTorrent.infoHash, 'hex')]
          } catch (err) {
            return undefined
          }
        })
        .filter(Boolean),
    [Page?.playbackSource]
  )

  useEffect(() => {
    if (!torrentSourcesInfoHashes?.length) return
    const infoHashes = torrentSourcesInfoHashes?.map(([, binStr]) => binStr)
    const infoHashesQuery = infoHashes.map((infoHash) => `info_hash=${escape(infoHash)}`).join('&')
    const nyaaUrl = `http://nyaa.tracker.wf:7777/scrape?${infoHashesQuery}`
    fetch(nyaaUrl)
      .then((res) => res.arrayBuffer())
      .then((res) => {
        if (Buffer.from(res).toString().includes('FetchError')) {
          throw new Error(Buffer.from(res).toString())
        }
        const decoded = Bencode.decode(Buffer.from(res))
        const newEntries =
          [...decoded.files.entries()]
            .map(([infoHash, data]) => [
              infoHash,
              data
            ])
        setTrackerData(new Map([...trackerData.entries(), ...newEntries]))
      })
  }, [torrentSourcesInfoHashes])

  const trackerDataPerSource = useMemo(
    () =>
      new Map(
        // @ts-expect-error
        Page
          ?.playbackSource
          ?.map((source) => {
            const foundTrackerData =
              [...trackerData.entries()]
                .find(([buffer]) =>
                  buffer.every((val, i) => val === torrentSourcesInfoHashes?.find(([uri]) => uri === source.uri)?.[2][i])
                )
                ?.[1]
            if (!foundTrackerData) return [source.uri, undefined]
            try {
              const torrentData: { complete: number, incomplete: number, downloaded: number } = JSON.parse(JSON.stringify(foundTrackerData))
              return [source.uri, torrentData]
            } catch (err) {
              return [source.uri, undefined]
            }
          })
          ?.filter(([uri, data]) => uri && data)
      ),
    [Page?.playbackSource, trackerData]
  )

  const currentSourceTrackerData = useMemo(
    () => trackerDataPerSource.get(currentSource?.uri),
    [currentSource, trackerDataPerSource]
  )

  const onSourcesClick = () => {
    setSearchParams({ sources: 'formatted' })
  }
  
  const sortedSources = useMemo(
    () =>
      trackerDataPerSource.size && Page?.playbackSource
        ? (
          [...Page?.playbackSource ?? []]
            ?.sort((a, b) => (trackerDataPerSource.get(b.uri)?.complete ?? 0) - (trackerDataPerSource.get(a.uri)?.complete ?? 0))
        )
        : [],
    [Page?.playbackSource, trackerDataPerSource]
  )

  useEffect(() => {
    if (!sortedSources) return
    for (const source of sortedSources) {
      if (!source.team?.url) continue
      getTeamIcon(source.team?.url, true)
    }
  }, [sortedSources])

  useEffect(() => {
    const bestMatch = sortedSources.at(0)
    if (trackerDataPerSource.size && sortedSources.length && trackerDataPerSource.size === sortedSources.length && bestMatch && !currentSource) {
      setLocation(getRoutePath(Route.WATCH, { mediaUri, episodeUri, sourceUri: bestMatch.uri }))
    }
  }, [currentSource, sortedSources, trackerDataPerSource])

  // const descriptionHtml = useMemo(
  //   () =>
  //     currentSource?.description
  //       ? DOMPurify.sanitize(marked.parse(currentSource?.description))
  //       : undefined,
  //   [currentSource?.description]
  // )

  // console.log('magnet', currentSourceObject?.magnetUri)

  return (
    <div css={style}>
      {
        currentSourceObject?.magnetUri
          ? (
            <iframe
              src={`https://torrent.fkn.app/embed?${new URLSearchParams({ fileIndex: 0, magnet: btoa(currentSourceObject?.magnetUri) })}`}
              allow="fullscreen"
              allowFullScreen
              frameBorder="0"
            />
          )
          : undefined
      }
      {/* <div
        className="description"
        dangerouslySetInnerHTML={{ __html: descriptionHtml }}
      ></div> */}
      <SourcesModal
        sources={sortedSources}
        trackerDataPerSource={trackerDataPerSource}
      />
      <div>
        <button style={{ display: 'inline-block' }} onClick={onSourcesClick}>Select sources manually</button>
      </div>
    </div>
  )
}

export default Watch
