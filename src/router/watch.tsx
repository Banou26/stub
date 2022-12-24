import type ParseTorrentFile from 'parse-torrent-file'
// import type { TorrentStatusResult } from '@fkn/lib/torrent'

import { Buffer } from 'buffer'

import { css } from '@emotion/react'
import { useEffect, useMemo, useState } from 'react'
import { fetch, torrent, torrentStatus, TorrentStatusType } from '@fkn/lib'
import FKNMediaPlayer from 'fkn-media-player'
import { of } from 'rxjs'
import DOMPurify from 'dompurify'
import * as marked from 'marked'
import ReactTooltip from 'react-tooltip'
import { AlertCircle, ArrowDown, ArrowUp, Users, Server } from 'react-feather'

import { getTitle } from '../../../../scannarr/src'
import { Uri } from '../../../../scannarr/src/utils'
import { cachedFetch } from '../utils/fetch'
import { useObservable } from '../utils/use-observable'
import { useFetch } from 'src/utils/use-fetch'
import ParseTorrent, { toMagnetURI } from 'parse-torrent'
import { getHumanReadableByteString } from '../utils/bytes'

const style = css`
  display: grid;
  height: calc(100vh - 6rem);
  grid-template-rows: 100% auto;
  /* overflow: hidden; */
  .player {
    height: calc(100vh - 6rem);
    /* width: 100%; */
    & > div {
      height: calc(100vh - 6rem);
      & > video, & > div {
        height: 100%;
        max-height: calc(100vh - 6rem);
      }
    }
  }

  .player, .player-overlay {
    grid-column: 1;
    grid-row: 1;
  }

  .player-overlay {
    display: grid;
    justify-content: center;
    align-items: center;
    & > div {
      padding: 2.5rem;
      margin-top: 25rem;
      position: relative;
      background-color: rgb(35, 35, 35);
    }
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

const torrentInfoStyle = css`
  
`

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

const TorrentInfo = ({ torrentInstance }: { torrentInstance?: ParseTorrentFile.Instance }) => {
  const [status, setStatus] = useState()
  console.log('torrent status', torrentInstance?.infoHash, status)
  useEffect(() => {
    if (!torrentInstance) return
    const interval = setInterval(() => {
      if (!torrentInstance.infoHash) return
      torrentStatus(torrentInstance.infoHash)
        .then(setStatus)
    }, 1_000)

    return () => {
      clearInterval(interval)
    }
  }, [torrentInstance])

  return (
    <div>
      <div>FKN proxy server's current torrent information stats</div>
      <div><Users/> {status?.connectedPeers ?? 0}</div>
      <div><ArrowUp/> {getHumanReadableByteString(status?.uploadRate ?? 0, true)}/s</div>
      <div><ArrowDown/> {getHumanReadableByteString(status?.downloadRate ?? 0, true)}/s</div>
    </div>
  )
}

export default ({ uri, titleUri, sourceUri }: { uri: Uri, titleUri: Uri, sourceUri: Uri }) => {
  const { value: title } = useObservable(() =>
    sourceUri
      ? getTitle({ uri: sourceUri }, { fetch: cachedFetch })
      : of(undefined),
    [uri]
  )

  const titleHandle = useMemo(
    () => title?.handles.find(({ uri }) => uri === sourceUri),
    [sourceUri, title]
  )

  const comments = useMemo(
    () => (
      titleHandle
        ?.comments
        ?.map((comment, i) => (
          <div key={i} className="comment">
            <div>
              <img className="avatar" src={comment.user.avatar} alt={`${comment.user.name} avatar`} referrer-policy="same-origin"/>
            </div>
            <div>
              <div>
                <a className="username" href={comment.user.url} target="_blank" rel="noopener noreferrer">{comment.user.name}</a>
                <a href={comment.url} className="date" target="_blank" rel="noopener noreferrer">
                  <span>{comment.date?.toDateString()}</span>
                </a>
              </div>
              <div
                className="message"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(comment.message.trim())) }}
              ></div>
            </div>
          </div>
        ))
    ),
    [titleHandle]
  )
  const [torrentInstance, setTorrent] = useState<ParseTorrentFile.Instance>()
  const magnet = useMemo(() => torrentInstance ? toMagnetURI(torrentInstance).replace('xt=urn:btih:[object Object]&', '') : undefined, [torrentInstance])
  // console.log('_torrent', torrentInstance)
  // console.log('magnet', magnet)

  const [torrentFileArrayBuffer, setTorrentFileArrayBuffer] = useState<ArrayBuffer | undefined>()
  const [size, setSize] = useState<number>()

  const [currentStreamOffset, setCurrentStreamOffset] = useState<number>(0)
  const [streamReader, setStreamReader] = useState<ReadableStreamDefaultReader<Uint8Array>>()

  useEffect(() => {
    if (!torrentFileArrayBuffer) return
    setTorrent(ParseTorrent(Buffer.from(torrentFileArrayBuffer)) as ParseTorrentFile.Instance)
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

  const url = useMemo((): string | undefined => {
    if (!title || !titleHandle) return
    const { url, type } =
      titleHandle
        .tags
        ?.find(({ type }) => type === 'source')
        ?.value

    if (type !== 'torrent-file') throw new Error('titleHandle source tag type isn\'t torrent-file')
    return url
  }, [title])

  useEffect(() => {
    if (!url) return
    cachedFetch(url)
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

        await setupStream(0)
        setSize(contentLength)
      })
  }, [torrentFileArrayBuffer])

  const descriptionHtml = useMemo(
    () =>
      titleHandle?.description
        ? DOMPurify.sanitize(marked.parse(titleHandle?.description))
        : undefined,
    [titleHandle?.description]
  )

  // todo: add more info on top of the description, e.g url, video infos, download rate, ect...
  return (
    <div css={style}>
      <div className="player">
        <FKNMediaPlayer
          size={size}
          fetch={onFetch}
          publicPath={'/build/'}
          workerPath={'/build/worker.js'}
          libassPath={'/build/subtitles-octopus-worker.js'}
        />
      </div>
      {
        undefined === undefined
          ? (
            <div className="player-overlay">
              <TorrentInfo torrentInstance={torrentInstance}/>
            </div>
          )
          : undefined
      }
      <div
        className="description"
        dangerouslySetInnerHTML={{ __html: descriptionHtml }}
      ></div>
      {
        comments?.length
          ? (
            <div className="comments">
              <div className="header">
                Comments
                {
                  titleHandle?.url
                    ? (
                      <span>
                        {' '}from
                        {' '}<a href={titleHandle?.url}>{titleHandle?.url}</a>
                      </span>
                    )
                    : null
                }
              </div>
              {comments}
            </div>
          )
          : null
      }
      
    </div>
  )
}
