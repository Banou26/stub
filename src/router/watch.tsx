import type ParseTorrentFile from 'parse-torrent-file'

import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { makeVar, useQuery, useReactiveVar } from '@apollo/client'
import * as Dialog from '@radix-ui/react-dialog'
import { css } from '@emotion/react'
import { useEffect, useMemo, useState } from 'react'
import { hex2bin } from 'uint8-util'
import { Buffer } from 'buffer'
import Bencode from 'bencode'
import parseTorrent, { toMagnetURI } from 'parse-torrent'
import { Uri, mergeScannarrUris } from 'scannarr/src/utils'
import { parse, format } from 'sacha'
import CountryLanguage from '@ladjs/country-language'
import FKNMediaPlayer from '@banou/media-player'
import DOMPurify from 'dompurify'
import * as marked from 'marked'

import { gql } from '../generated'
import { fetch } from '../utils/fetch'
import { overlayStyle } from '../components/modal'
import { getHumanReadableByteString } from '../utils/bytes'
import { Route, getRoutePath } from './path'
import { GetPlaybackSourcesQuery } from 'src/generated/graphql'
import { torrent } from '@fkn/lib'

const sourceModalStyle = css`
overflow: auto;
${overlayStyle}
display: flex;
justify-content: center;
padding: 5rem;

.modal {
  position: relative;
  display: flex;
  flex-direction: column;
  max-width: 150rem;
  background-color: rgb(35, 35, 35);
  border-radius: 1rem;
  box-shadow: hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
  overflow: hidden;
  animation: contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
  height: min-content;

  .content {
    margin: 2.5rem;
    
    & > .title {
      display: flex;
      justify-content: start;
      align-items: center;

      h2 {
        font-size: 3rem;
      }

      .origins {
        display: flex;
        justify-content: start;
        align-items: center;
        margin-left: 1rem;

        a {
          display: flex;
          justify-content: center;
          align-items: center;
          
          img {
            height: 3rem;
            width: 3rem;
          }
        }
      }
    }


    table {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      border: 1px solid rgb(50, 50, 50);
      border-radius: 0.5rem;
      overflow: hidden;
      margin-top: 1rem;

      thead {
        background-color: rgb(50, 50, 50);
        color: rgb(255, 255, 255);
        font-size: 1.5rem;
        font-weight: 500;
        text-align: left;
        text-transform: uppercase;
        letter-spacing: 0.1rem;
        border-bottom: 1px solid rgb(50, 50, 50);
        
        th {
          padding: 1rem 2rem;

          &:first-of-type {
            padding-left: 3rem;

            button {
              /* background-color: transparent; */
              background-color: rgb(32, 32, 32);
              padding: 0.5rem 1rem;
              border: none;
              color: rgb(255, 255, 255);
              font-size: 1.5rem;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.1rem;
              cursor: pointer;

              &:hover {
                text-decoration: underline;
              }
            }
          }

          &.upload-date {
            width: 12rem;
          }
        }
      }

      tbody {
        tr {
          border-bottom: 1px solid rgb(50, 50, 50);

          .link {
            display: inline-block;
            width: 100%;
            height: 100%;
            position: absolute;
            inset: 0;
          }

          &:hover {
            background-color: rgb(50, 50, 50);
          }

          & > td {
            padding: 1rem 2rem;
            font-size: 1.5rem;
            font-weight: 500;
            text-align: left;
            letter-spacing: 0.1rem;
            color: rgb(255, 255, 255);
            vertical-align: middle;
            position: relative;

            line-height: 2.5rem;

            ::first-line {
                line-height: 1;
            }

            &.name div {
              display: flex;
              align-items: center;
            }

            text-align: right;
            &:first-of-type {
              text-align: left;
            }
          }

          .title {
            display: inline-block;
            height: 100%;
            margin-right: 1rem;
            margin-bottom: auto;
            vertical-align: middle;
            word-break: break-all;
          }

          .team-link {
            position: absolute;
          }
          .team-link-back {
            opacity: 0;
          }
          .team {
            display: inline-block;
            height: 2rem;
            min-width: 2rem;
            margin-right: 0.5rem;
            vertical-align: bottom;
            margin-right: 1rem;
          }
          div.team {
            display: inline-block;
          }

          .languages {
            margin-left: 1rem;
            
            img {
              height: 2rem;
              margin-right: 0.5rem;
              vertical-align: bottom;
            }
          }

          .tags {
            margin-left: 1rem;
            background-color: rgb(50, 50, 50);
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            margin-right: 0.5rem;
            margin-bottom: 0.5rem;
            font-size: 1.5rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.1rem;
          }
        }
      }
    }
  }
}

`

const style = css`
  display: grid;
  height: calc(100vh - 6rem);
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


const playerStyle = css`
height: calc(90vh - 6rem);
/* width: 90%; */
& > div {
  height: calc(90vh - 6rem);
  & > video, & > div {
    height: 100%;
    max-height: calc(100vh - 6rem);
  }
}

grid-column: 1;
grid-row: 1;

.player-overlay {
  display: grid;
  justify-content: center;
  align-items: center;
  grid-column: 1;
  grid-row: 1;
  & > div {
    padding: 2.5rem;
    margin-top: 25rem;
    position: relative;
    background-color: rgb(35, 35, 35);
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

const teams = makeVar({})

const getTeamIcon = (url, noHook = false) => {
  const cachedValue = noHook ? teams()[url] : useReactiveVar(teams)[url]
  if (cachedValue && !(cachedValue instanceof Promise)) return cachedValue
  if (cachedValue instanceof Promise) return undefined
  const res = fetch(url)
    .then(res => res.text())
    .then((res) => {
      const parser = new DOMParser()
      const doc = parser.parseFromString(res, 'text/html')
      const img = doc.querySelector<HTMLLinkElement>('link[rel*="icon"]')
      const _href = img?.getAttribute('href')
      const href =
        _href?.startsWith('http')
          ? _href
          : `${new URL(url).origin}${_href?.startsWith('/') ? '' : '/'}${_href ?? ''}`
      teams({ ...teams(), [url]: href })
      return href
    })
  teams({ ...teams(), [url]: res })
  return undefined
}

const SourceRow = ({ raw, source, trackerData }: { raw, source, trackerData }) => {
  const { mediaUri, episodeUri } = useParams() as { mediaUri: Uri, episodeUri: Uri }
  const teamIcon = source.team?.url && getTeamIcon(source.team?.url)
  const parsed = useMemo(() => parse(source.filename), [source.filename])
  const formatted = useMemo(() => format(parsed), [parsed])
  const countries =
    [
      ...new Map(
        [
          ...new Map(
            formatted
              .audioLanguageTerms
              ?.flatMap(lang => CountryLanguage.getLanguageCountries(lang.split('-').at(0)))
              .map((country) => [country.numCode, country])
          ).values()
        ]
        .map(country => CountryLanguage.getCountryLanguages(country.code_3))
        .filter(langs => langs.length === 1)
        .flatMap(langs => langs.map(lang => [lang.iso639_3, lang]))
      )
      .values()
    ]
    .map(country =>
      country.iso639_3 === 'eng'
        ? { ...country, iso639_1: 'gb' }
        : country
    )

  // const uploadDate = new Date(source.uploadDate).toLocaleDateString({ year: 'numeric', month: 'long', day: 'numeric' })

  const airedTime = Date.now() - new Date(source.uploadDate).getTime()

  const relativeTime =
    !isNaN(airedTime) && isFinite(airedTime)
      ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-Math.round(airedTime / 1000 / 60 / 60 / 24), 'days')
      : undefined

  const tags = [
    ...formatted.resolutionTerms ?? []
  ]

  const [hideIcon, setHideIcon] = useState(false)

  const watchEpisodeUrl = getRoutePath(Route.WATCH, { episodeUri, mediaUri, sourceUri: source.uri })

  const sourceLink = <Link className="link" to={watchEpisodeUrl} />

  return (
    <tr className="source" key={source.uri}>
      <td className='name'>
        {sourceLink}
        <div>
          {
            !raw && (
                <>
                  <a href={source.team?.url ?? watchEpisodeUrl} className="team-link">
                    {
                      teamIcon && !hideIcon
                        ? <img className="team" title={formatted.groups?.at(0)} src={teamIcon} onError={event => setHideIcon(true)}/>
                        : (
                          formatted.groups?.at(0)
                            ? <div className="team">{formatted.groups?.at(0) ? `[${formatted.groups?.at(0)}]` : ''}</div>
                            : undefined
                        )
                    }
                  </a>
                  <a href={source.team?.url ?? watchEpisodeUrl} className="team-link-back">
                    {
                      teamIcon && !hideIcon
                        ? <img className="team" title={formatted.groups?.at(0)} src={teamIcon} onError={event => setHideIcon(true)}/>
                        : (
                          formatted.groups?.at(0)
                            ? <div className="team">{formatted.groups?.at(0) ? `[${formatted.groups?.at(0)}]` : ''}</div>
                            : undefined
                        )
                    }
                  </a>
                </>
              )
          }
          <span>
            <span className="title">{raw ? source.filename : formatted.titles.join(' ')}</span>
            {
              !raw &&
              countries.length > 0 &&
              <span className="languages">
                {
                  countries.map((country) =>
                    <img
                      key={country.iso639_1}
                      src={`http://purecatamphetamine.github.io/country-flag-icons/3x2/${country.iso639_1.toUpperCase()}.svg`}
                    />
                  )
                }
              </span>
            }
            {
              !raw && tags.length > 0 && (
                <span className="tags">
                  {
                    tags.map((tag) =>
                      <span key={tag}>{tag}</span>
                    )
                  }
                </span>
              )
            }
          </span>
        </div>
      </td>
      <td>{sourceLink}{getHumanReadableByteString(source.bytes)}
      </td>
      <td>{sourceLink}{trackerData.complete}</td>
      <td>{sourceLink}{trackerData.incomplete}</td>
      <td>{sourceLink}{trackerData.downloaded}</td>
      <td>{sourceLink}{relativeTime}</td>
    </tr>
  )
}

const SourcesModal = (
  { sources, trackerDataPerSource }:
  {
    sources: GetPlaybackSourcesQuery['Page']['playbackSource'],
    trackerDataPerSource: Map<any, { complete: number, incomplete: number, downloaded: number }>
  }
) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const sourcesModalOpen = Boolean(searchParams.get('sources'))
  const displayRawName = searchParams.get('sources') === 'raw'

  const onOverlayClick = (ev) => {
    if (ev.target !== ev.currentTarget) return
    const { sources, ...rest } = searchParams
    setSearchParams(rest)
  }

  return (
    <Dialog.Root open={sourcesModalOpen}>
      <Dialog.Portal>
        <Dialog.Content css={sourceModalStyle} asChild={true}>
          <div onClick={onOverlayClick}>
            <div className="modal">
              <div className="trailer">
                {/* <MinimalPlayer className="player"/> */}
              </div>
              <div className="content">
                <div className="title">
                  <h2>Sources</h2>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Name <button onClick={() => setSearchParams({ sources: searchParams.get('sources') === 'raw' ? 'formatted' : 'raw' })}>{displayRawName ? 'raw' : 'formatted'}</button></th>
                      <th>Size</th>
                      <th>Seed</th>
                      <th>Leech</th>
                      <th>Downloads</th>
                      <th className="upload-date">Upload date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {
                      sources
                        ?.map((source) =>
                          <SourceRow
                            key={source.uri}
                            raw={displayRawName}
                            source={source}
                            trackerData={trackerDataPerSource?.get(source.uri)}
                          />
                        )
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}


const BACKPRESSURE_STREAM_ENABLED = !navigator.userAgent.includes("Firefox")
const BASE_BUFFER_SIZE = 5_000_000

export const bufferStream = ({ stream, size: SIZE }: { stream: ReadableStream, size: number }) =>
  new ReadableStream<Uint8Array>({
    start() {
      // @ts-ignore
      this.reader = stream.getReader()
    },
    async pull(controller) {
      // @ts-ignore
      const { leftOverData }: { leftOverData: Uint8Array | undefined } = this

      const accumulate = async ({ buffer = new Uint8Array(SIZE), currentSize = 0 } = {}): Promise<{ buffer?: Uint8Array, currentSize?: number, done: boolean }> => {
        // @ts-ignore
        const { value: newBuffer, done } = await this.reader.read()
  
        if (currentSize === 0 && leftOverData) {
          buffer.set(leftOverData)
          currentSize += leftOverData.byteLength
          // @ts-ignore
          this.leftOverData = undefined
        }
  
        if (done) {
          return { buffer: buffer.slice(0, currentSize), currentSize, done }
        }
  
        let newSize
        const slicedBuffer = newBuffer.slice(0, SIZE - currentSize)
        newSize = currentSize + slicedBuffer.byteLength
        buffer.set(slicedBuffer, currentSize)
  
        if (newSize === SIZE) {
          // @ts-ignore
          this.leftOverData = newBuffer.slice(SIZE - currentSize)
          return { buffer, currentSize: newSize, done: false }
        }
        
        return accumulate({ buffer, currentSize: newSize })
      }
      const { buffer, done } = await accumulate()
      if (buffer?.byteLength) controller.enqueue(buffer)
      if (done) controller.close()
    }
  })

const Player = ({ source }: { source }) => {
  const [torrentInstance, setTorrent] = useState<ParseTorrentFile.Instance>()
  const magnet = useMemo(() => torrentInstance ? toMagnetURI(torrentInstance).replace('xt=urn:btih:[object Object]&', '') : undefined, [torrentInstance])

  const [torrentFileArrayBuffer, setTorrentFileArrayBuffer] = useState<ArrayBuffer | undefined>()
  const [size, setSize] = useState<number>()

  const [currentStreamOffset, setCurrentStreamOffset] = useState<number>(0)
  const [streamReader, setStreamReader] = useState<ReadableStreamDefaultReader<Uint8Array>>()

  useEffect(() => {
    if (!torrentFileArrayBuffer) return
    setTorrent(parseTorrent(Buffer.from(torrentFileArrayBuffer)) as ParseTorrentFile.Instance)
  }, [torrentFileArrayBuffer])

  useEffect(() => {
    if (!streamReader) return
    return () => {
      streamReader.cancel()
    }
  }, [streamReader])

  const setupStream = async (offset: number) => {
    if (streamReader) {
      streamReader.cancel()
    }
    const streamResponse = await onFetch(offset, undefined, true)
    if (!streamResponse.body) throw new Error('no body')
    const stream = bufferStream({ stream: streamResponse.body, size: BASE_BUFFER_SIZE })
    const reader = stream.getReader()
    setStreamReader(reader)
    setCurrentStreamOffset(offset)
    return reader
  }

  const onFetch = async (offset: number, end?: number, force?: boolean) => {
    if (force || end !== undefined && ((end - offset) + 1) !== BASE_BUFFER_SIZE) {
      return torrent({
        arrayBuffer: structuredClone(torrentFileArrayBuffer),
        fileIndex: 0,
        offset,
        end
      })
    }
    const _streamReader =
      currentStreamOffset !== offset
        ? await setupStream(offset)
        : streamReader

    if (!_streamReader) throw new Error('Stream reader not ready')
    return new Response(
      await _streamReader
        .read()
        .then(({ value }) => {
          if (value) {
            setCurrentStreamOffset(offset => offset + value.byteLength)
          }
          return value
        })
    )
  }

  const url = useMemo(() => source?.data && JSON.parse(source?.data).torrentUrl, [source?.data])

  useEffect(() => {
    if (!url) return
    fetch(url)
      .then(async res => setTorrentFileArrayBuffer(await res.arrayBuffer()))
  }, [url])

  useEffect(() => {
    if (!torrentFileArrayBuffer) return
    torrent({ arrayBuffer: structuredClone(torrentFileArrayBuffer), fileIndex: 0, offset: 0, end: 1 })
      .then(async (res) => {
        const { headers, body } = res
        if (!body) throw new Error('no body')
        const contentRangeContentLength = headers.get('Content-Range')?.split('/').at(1)
        const contentLength =
          contentRangeContentLength
            ? Number(contentRangeContentLength)
            : Number(headers.get('Content-Length'))

        if (BACKPRESSURE_STREAM_ENABLED) await setupStream(0)
        setSize(contentLength)
      })
  }, [torrentFileArrayBuffer])

  const jassubWorkerUrl = useMemo(() => {
    const workerUrl = new URL('/build/jassub-worker.js', new URL(window.location.toString()).origin).toString()
    const blob = new Blob([`importScripts(${JSON.stringify(workerUrl)})`], { type: 'application/javascript' })
    return URL.createObjectURL(blob)
  }, [])

  const libavWorkerUrl = useMemo(() => {
    const workerUrl = new URL('/build/libav.js', new URL(window.location.toString()).origin).toString()
    const blob = new Blob([`importScripts(${JSON.stringify(workerUrl)})`], { type: 'application/javascript' })
    return URL.createObjectURL(blob)
  }, [])

  return (
    <div css={playerStyle}>
      <FKNMediaPlayer
        size={size}
        fetch={(offset, end) => onFetch(offset, end, !BACKPRESSURE_STREAM_ENABLED)}
        publicPath={new URL('/build/', new URL(window.location.toString()).origin).toString()}
        libavWorkerUrl={libavWorkerUrl}
        libassWorkerUrl={jassubWorkerUrl}
      />
    </div>
  )
}

export default () => {
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
