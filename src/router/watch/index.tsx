import { useLocation, useParams } from 'wouter'
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
import Spinner from '../../images/spinner.svg'

const style = css`
  display: grid;
  height: 100%;
  width: 100%;
  grid-template-rows: 100% auto;

  .source {
    padding: 0.5rem 1rem;
    margin: 0.5rem 0;
    border: none;
    border-radius: 0.5rem;
    font-size: 1.5rem;
    @media (min-width: 2560px) {
      font-size: 2.2rem;
    }
    background: rgb(35, 35, 35);
    cursor: pointer;
    z-index: 1;
  }

  .loading {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    font-size: 1.5rem;
    @media (min-width: 640px) {
      font-size: 2.2rem;
    }
    @media (min-width: 2560px) {
      font-size: 3rem;
    }
    gap: 1rem;

    .spinner {
      margin-top: -4rem;
    }
  }

  iframe {
    height: 100%;
    width: 100%;
    border: none;
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

  query GetPlaybackSources($input: PlaybackSourcePageInput!) {
    playbackSourcePage(input: $input) {
      nodes {
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

  query GetWatchMedia($input: MediaPageInput!) {
    media(input: $input) {
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
  
  const [{ data: { media } = { media: undefined } }] = useQuery({
    query: GET_WATCH_MEDIA,
    variables: {
      input: {
        uri: mediaUri!
      }
    },
    pause: !mediaUri
  })

  const [{ error, data: { playbackSourcePage } = { playbackSourcePage: undefined } }] = useQuery(
    {
      query: GET_PLAYBACK_SOURCES,
      variables: {
        input: {
          uri,
          number: Number(episodeId)
        }
      },
      pause: !uri
    }
  )

  const currentSource = useMemo(
    () => playbackSourcePage?.nodes?.find((source) => source.uri === sourceUri),
    [playbackSourcePage?.nodes, sourceUri]
  )

  const currentSourceObject = useMemo(
    () => currentSource && JSON.parse(currentSource?.data),
    [currentSource]
  )
  
  useEffect(() => {
    if (!(currentSource && currentSource.uri !== sourceUri)) return
    setSearchParams({ details: currentSource.uri }, { replace: true })
  }, [currentSource, sourceUri])

  const [trackerData, setTrackerData] = useState(new Map())

  const torrentSourcesInfoHashes = useMemo(
    () =>
      playbackSourcePage
        ?.nodes
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
    [playbackSourcePage?.nodes]
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
        playbackSourcePage
          ?.nodes
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
    [playbackSourcePage?.nodes, trackerData]
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
      trackerDataPerSource.size && playbackSourcePage?.nodes
        ? (
          [...playbackSourcePage?.nodes ?? []]
            ?.sort((a, b) => (trackerDataPerSource.get(b.uri)?.complete ?? 0) - (trackerDataPerSource.get(a.uri)?.complete ?? 0))
        )
        : [],
    [playbackSourcePage?.nodes, trackerDataPerSource]
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
      setLocation(getRoutePath(Route.WATCH, { mediaUri, episodeUri, sourceUri: bestMatch.uri }), { replace: true })
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
            <div className='fullscreen'>
              <iframe
                src={`https://torrent.fkn.app/embed?${new URLSearchParams({ fileIndex: 0, magnet: btoa(currentSourceObject?.magnetUri) })}`}
                allow="fullscreen"
                allowFullScreen
              />
              <div>
                <button className='source' onClick={onSourcesClick}>Select sources manually</button>
              </div>
            </div>
          )
          : (
            <div>
                <div className='loading'>
                  <span>Loading...</span>
                  <span className='title'>
                    {
                      media?.title?.romanized
                      ?? media?.title?.english
                      ?? media?.title?.native
                    } - {episodeId}
                  </span>
                  <button className='source' onClick={onSourcesClick}>Select sources manually</button>
                  <img src={Spinner} alt="Loading" className='spinner'/>
                </div>
            </div>
          )
      }
      {/* <div
        className="description"
        dangerouslySetInnerHTML={{ __html: descriptionHtml }}
      ></div> */}
      <SourcesModal
        sources={sortedSources}
        trackerDataPerSource={trackerDataPerSource}
      />
    </div>
  )
}

export default Watch
