import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useQuery} from '@apollo/client'
import { css } from '@emotion/react'
import { useEffect, useMemo, useState } from 'react'
import { hex2bin } from 'uint8-util'
import { Buffer } from 'buffer'
import Bencode from 'bencode'
import parseTorrent from 'parse-torrent'
import { Uri, mergeScannarrUris } from 'scannarr/src/utils'

import { gql } from '../../generated'
import { fetch } from '../../utils/fetch'
import { Route, getRoutePath } from '../path'
import Player from './player'
import SourcesModal, { getTeamIcon } from './sources-modal'

const style = css`
  display: grid;
  height: 100%;
  grid-template-rows: 100% auto;

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


export const GET_PLAYBACK_SOURCES = gql(`#graphql
  query GetPlaybackSources($uri: String, $origin: String, $id: String, $search: String, $name: String, $resolution: String, $season: Int, $number: Float) {
    Page {
      playbackSource(uri: $uri, origin: $origin, id: $id, search: $search, name: $name, resolution: $resolution, season: $season, number: $number) {
        handler
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
          handler
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
    }
  }
`)



const Watch = () => {
  const { mediaUri, episodeUri, sourceUri } = useParams() as { mediaUri: Uri, episodeUri: Uri, sourceUri?: Uri }
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const uri = mergeScannarrUris([mediaUri, episodeUri])
  const episodeId = episodeUri.split('-')[1]
  const { error, data: { Page } = {} } = useQuery(
    GET_PLAYBACK_SOURCES,
    {
      variables: { uri, number: Number(episodeId) },
      skip: !uri
    }
  )

  const currentSource = useMemo(
    () => Page?.playbackSource?.find((source) => source.uri === sourceUri),
    [Page?.playbackSource, sourceUri]
  )

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
        }),
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
      navigate(getRoutePath(Route.WATCH, { mediaUri, episodeUri, sourceUri: bestMatch.uri }))
    }
  }, [currentSource, sortedSources, trackerDataPerSource])

  // const descriptionHtml = useMemo(
  //   () =>
  //     currentSource?.description
  //       ? DOMPurify.sanitize(marked.parse(currentSource?.description))
  //       : undefined,
  //   [currentSource?.description]
  // )

  return (
    <div css={style}>
      <Player source={currentSource}/>
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
