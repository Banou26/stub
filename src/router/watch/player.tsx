import type ParseTorrentFile from 'parse-torrent-file'

import { useEffect, useMemo, useState } from 'react'
import { Buffer } from 'buffer'
import parseTorrent, { toMagnetURI } from 'parse-torrent'
import { css } from '@emotion/react'

import FKNMediaPlayer from '@banou/media-player'

import { fetch } from '../../utils/fetch'
import { torrent } from '@fkn/lib'

const playerStyle = css`
height: 100%;
/* width: 100%; */
& > div {
  height: 100%;
  & > video, & > div {
    height: 100%;
    max-height: 100%;
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

export default Player
