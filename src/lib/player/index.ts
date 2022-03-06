import type { Wire } from 'bittorrent-protocol'
import { Instance } from 'webtorrent'

import { Readable } from 'stream'

import WebTorrent, { Torrent } from 'webtorrent'
import { createFile } from 'mp4box'
import { openDB, DBSchema } from 'idb'
import SimplePeer from 'simple-peer'
import { SubtitleParser } from 'matroska-subtitles'
import SubtitlesOctopus from 'libass-wasm'

import { client as apolloClient } from '../../apollo'
import { default as IDBChunkStore } from './idb-store'

import { remux } from '@banou26/oz-libav'

let ffmpeg
let client: Instance
export interface Peer {
  wire: Wire
  address?: string
}

export interface DashDB extends DBSchema {
  fragments: {
    key: IDBValidKey
    value: ArrayBuffer[]
  }
}

interface StreamInit {
  path: string
  filename: string
  stream: string
  extension: string
}
// interface Chunk extends StreamInit {
//   chunk: string
// }

// interface BufferChunk {
//   buffered: boolean
//   startTime: number
//   endTime?: number
//   offset: number
//   endOffset?: number
// }

// enum SourceBufferState {
//   SOURCE_APPEND = 'SOURCE_APPEND',
//   SEEK_APPEND = 'SEEK_APPEND',
//   REMOVE = 'REMOVE',
//   IDLE = 'IDLE'
// }

export enum Api {
  APPEND_BUFFER = 'APPEND_BUFFER',
  GET_FILE_INFO = 'GET_FILE_INFO',
  GET_FRAMES = 'GET_FRAMES',
  UNLINK = 'UNLINK'
}

interface Chunk {
  id: number
  start: number
  end: number
  buffered: boolean
}

export const call = <T = any>(worker, type: Api, data?: any, transfer: Transferable[] = []): Promise<T> =>
  new Promise(resolve => {
    const { port1, port2 } = new MessageChannel()

    port1.addEventListener(
      'message',
      ({ data }) => {
        resolve(data)
        port1.close()
        port2.close()
      },
      { once: true }
    )
    port1.start()

    worker.postMessage(
      {
        type,
        data,
        port: port2
      },
      [port2, ...transfer ?? []]
    )
  })

const downloadArrayBuffer = buffer => {
  const videoBlob = new Blob([new Uint8Array(buffer, 0, buffer.length)], { type: 'video/mp4' });

  var xhr = new XMLHttpRequest();
  xhr.open("GET", URL.createObjectURL(videoBlob));
  xhr.responseType = "arraybuffer";

  xhr.onload = function () {
      if (this.status === 200) {
          var blob = new Blob([xhr.response], {type: "application/octet-stream"});
          var objectUrl = URL.createObjectURL(blob);
          window.open(objectUrl);
      }
  };
  xhr.send();
}

// todo: transform this code into a stream based transmuxer
// todo: use available file systems(IDB, NativeFileSystem, ect...) to save the buffers to reduce the memory usage
const playFile = async (file: ReadableStream, fileSize: number) => {
  console.log('playFile', file, fileSize)
  // const fileStream: Readable = file.createReadStream()

  // const [body, body2] = file.tee()


  // const originalReader = file.getReader()

  // const [body, controller] = await new Promise<[ReadableStream<Uint8Array>, ReadableStreamDefaultController<any>]>(resolve => {
  //   let controller
  //   resolve([
  //     new ReadableStream({
  //       start: _controller => {
  //         controller = _controller
  //       }
  //     }),
  //     controller
  //   ])
  // })
  // console.log('controller', controller)

  const parser = new SubtitleParser()

  let header
  const events: string[] = []

  // first an array of subtitle track information is emitted
  parser.once('tracks', (tracks, chunk) => {
    header = tracks[0].header
    console.log(tracks, chunk)
  })
  
  parser.on('file', file => console.log('file:', file))

  const toHHMMSSMS = (time: number) => {
    const ms = time % 1000 / 10
    const ss = time / 1000 % 60
    const mm = time / 1000 / 60 % 60
    const hh = time / 1000 / 60 / 60 % 24
    return `${Math.floor(hh).toString().padStart(1, '0')}:${Math.floor(mm).toString().padStart(2, '0')}:${Math.floor(ss).toString().padStart(2, '0')}.${Math.floor(ms).toString().padStart(2, '0')}`
  }

  const generateSubtitles = () =>
    `${header}\n${events.join('\n')}`

  let subtitlesOctopusInstance

  // afterwards each subtitle is emitted
  parser.on('subtitle', (subtitle, trackNumber, chunk) => {
    const start = toHHMMSSMS(subtitle.time)
    const end = toHHMMSSMS(subtitle.time + subtitle.duration)
    const sourceProperties = ['layer', 'style', 'name', 'marginL', 'marginR', 'marginV', 'effect', 'text']
    // Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
    const source =
      [
        subtitle.layer,
        start,
        end,
        ...sourceProperties.slice(1).map((key) => subtitle[key])
      ].join(',')

    const line = `Dialogue: ${source}`
    events.push(line)
    console.log('Track ' + trackNumber + ':', subtitle, chunk)
    console.log('Track source: ', source)

    // console.log('header + events', header, events)
    if (subtitlesOctopusInstance) {
      // subtitlesOctopusInstance.freeTrack()
      subtitlesOctopusInstance.setTrack(generateSubtitles())
    }
  })

  console.log(parser)

  // const body = new ReadableStream({
  //   start(controller) {
  //     function push() {
  //       originalReader.read().then( ({ done, value }) => {
  //         if (done) {
  //           parser.end()
  //           controller.close()
  //           console.log('body end')
  //           return
  //         }
  //         parser.write(value)
  //         controller.enqueue(value)
  //         push()
  //       })
  //     }
  //     push()
  //   }
  // })

  class Passthrough extends TransformStream {
    constructor () {
      super({
        start() {},
        async transform(chunk, controller) {
          if (!chunk) {
            controller.terminate()
            parser.end()
            console.log('controller.terminate()')
            return
          }
          controller.enqueue(chunk)
          parser.write(chunk)
        },
        flush() {}
      })
    }
  }

  const bodyStream = file.pipeThrough(new Passthrough())

  // fileStream.addListener('data', chunk => {
  //   parser.write(chunk)
  //   controller.enqueue(chunk)
  // })
  // // fileStream.addListener('data', chunk => console.log('chunk', chunk) || controller.enqueue(chunk))
  // fileStream.addListener('end', () => controller.close())
  // fileStream.addListener('close', () => {
  //   parser.end()
  //   controller.close()
  // })
  // fileStream.addListener('error', err => controller.error(err))

  // const readSubtitles = async () => {
  //   const { value: arrayBuffer, done } = await subtitlesReader.read()
  //   if (done) return parser.end()
  //   parser.write(arrayBuffer)
  //   readSubtitles()
  // }
  // readSubtitles()

  const { stream, getInfo } = await remux({ size: fileSize, stream: bodyStream, autoStart: true })
  const reader = stream.getReader()
  let resultBuffer = new Uint8Array(fileSize + (fileSize * 0.01) + 1_000_000)
  let processedBytes = 0
  console.log('stream', stream, resultBuffer, fileSize)

  let mp4boxfile = createFile()
  mp4boxfile.onError = e => console.error('onError', e)
  const chunks: Chunk[] = []

  mp4boxfile.onSamples = (id, user, samples) => {
    const groupBy = (xs, key) => {
      return xs.reduce((rv, x) => {
        (rv[x[key]] = rv[x[key]] || []).push(x)
        return rv
      }, []).filter(Boolean)
    }
    const groupedSamples = groupBy(samples, 'moof_number')
    for (const group of groupedSamples) {
      const firstSample = group[0]
      const lastSample = group.slice(-1)[0]

      if (chunks[firstSample.moof_number - 1]) continue

      chunks[firstSample.moof_number - 1] = {
        id: firstSample.moof_number - 1,
        start: firstSample.cts / firstSample.timescale,
        end: lastSample.cts / lastSample.timescale,
        buffered: false
      }
    }
  }

  mp4boxfile.onMoovStart = function () {
    console.log("Starting to receive File Information");
  }

  mp4boxfile.onSegment = function (id, user, buffer, sampleNumber, last) {
    console.log("Received segment on track "+id+" for object "+user+" with a length of "+buffer.byteLength);
  }

  const mp4InfosPromise = new Promise<[string, any]>(resolve => {
    console.log('REEEEEEEEEEEEEEEEEEEEEEEEEEEE')
    let mime = 'video/mp4; codecs=\"'
    let info
    mp4boxfile.onReady = (_info) => {
      console.log('mp4boxfile.onReady AAAAAAAAAAAAAAAAAAAAAAAAAAAAA', _info)
      info = _info
      for (let i = 0; i < info.tracks.length; i++) {
        if (i !== 0) mime += ','
        mime += info.tracks[i].codec
      }
      mime += '\"'
      mp4boxfile.setExtractionOptions(1, undefined, { nbSamples: 1000 })
      mp4boxfile.start()
      resolve([mime, info])
    }
  })

  let first = true
  let second = false
  const read = async () => {
    const { value: arrayBuffer, done } = await reader.read()
    console.log('reader.read', arrayBuffer, done)
    if (done || !arrayBuffer) {
      resultBuffer = resultBuffer.slice(0, processedBytes)
      mp4boxfile.flush()
      // downloadArrayBuffer(resultBuffer)
      return
    }

    // if (!first) {
      const buffer = arrayBuffer.buffer
      // @ts-ignore
      buffer.fileStart = processedBytes
      mp4boxfile.appendBuffer(buffer)
      console.log('buffer', buffer)
    // }

    resultBuffer.set(arrayBuffer, processedBytes)
    processedBytes += arrayBuffer.byteLength

    if (first) {
      first = false
      return read()
    }
    read()
  }

  await read()
  console.log('read after')

  const [ mime, info ] = await mp4InfosPromise
  console.log('mp4InfosPromise', mime)

  const duration = getInfo().input.duration / 1_000_000
  console.log('duration', duration)

  const video = document.createElement('video')
  video.autoplay = true
  video.controls = true
  video.volume = 0
  video.addEventListener('error', ev => {
    // @ts-ignore
    console.error(ev.target.error)
  })
  document.body.appendChild(video)

  if (header) {
    subtitlesOctopusInstance = new SubtitlesOctopus({
      video,
      subContent: generateSubtitles(),
      // fonts: ['/test/font-1.ttf', '/test/font-2.ttf'], // Links to fonts (not required, default font already included in build)
      workerUrl: '/subtitles-octopus-worker.js', // Link to WebAssembly-based file "libassjs-worker.js"
      legacyWorkerUrl: '/subtitles-octopus-worker-legacy.js' // Link to non-WebAssembly worker
    })
    console.log('SubtitlesOctopus', SubtitlesOctopus)
  }

  const mediaSource = new MediaSource()
  video.src = URL.createObjectURL(mediaSource)

  const sourceBuffer: SourceBuffer =
    await new Promise(resolve =>
      mediaSource.addEventListener(
        'sourceopen',
        () => resolve(mediaSource.addSourceBuffer(mime)),
        { once: true }
      )
    )

  mediaSource.duration = duration
  sourceBuffer.mode = 'segments'

  let resolve, reject, abortResolve

  const getTimeRanges = () =>
    Array(sourceBuffer.buffered.length)
      .fill(undefined)
      .map((_, index) => ({
        index,
        start: sourceBuffer.buffered.start(index),
        end: sourceBuffer.buffered.end(index)
      }))

  const getTimeRange = (time: number) =>
    getTimeRanges()
      .find(({ start, end }) => time >= start && time <= end)

  const appendBuffer = (buffer: ArrayBuffer) =>
    new Promise((_resolve, _reject) => {
      resolve = _resolve
      reject = _reject
      sourceBuffer.appendBuffer(buffer)
    })

  const removeRange = ({ start, end, index }: { start: number, end: number, index: number }) =>
    new Promise((_resolve, _reject) => {
      // console.log('removeRange', start, end, index)
      resolve = _resolve
      reject = _reject
      sourceBuffer.remove(
        Math.max(sourceBuffer.buffered.start(index), start),
        Math.min(sourceBuffer.buffered.end(index), end)
      )
    })

  const appendChunk = async (chunk: Chunk) => {
    // console.log('appendChunk', chunk)
    await appendBuffer(
      resultBuffer.buffer.slice(
        // segment metadata
        mp4boxfile.moofs[chunk.id].start,
        // segment data
        mp4boxfile.mdats[chunk.id].start + mp4boxfile.mdats[chunk.id].size
      )
    )
    chunk.buffered = true
  }

  const removeChunk = async (chunk: Chunk) => {
    // console.log('removeChunk', chunk)
    const range = getTimeRange(chunk.start) ?? getTimeRange(chunk.end)
    if (!range) throw new RangeError('No TimeRange found with this chunk')
    await removeRange({ start: chunk.start, end: chunk.end, index: range.index })
    chunk.buffered = false
  }

  const abort = () =>
    new Promise(resolve => {
      console.log('abort')
      abortResolve = resolve
      sourceBuffer.abort()
    })

  sourceBuffer.addEventListener('updateend', ev => resolve(ev))
  sourceBuffer.addEventListener('abort', ev => {
    reject(ev)
    abortResolve(ev)
  })
  sourceBuffer.addEventListener('error', ev => reject(ev))

  const initializationBuffer = resultBuffer.buffer.slice(0, mp4boxfile.moov.start + mp4boxfile.moov.size)
  await appendBuffer(initializationBuffer)


  const throttle = (func, limit) => {
    let inThrottle
    return function() {
      const args = arguments
      const context = this
      if (!inThrottle) {
        func.apply(context, args)
        inThrottle = true
        setTimeout(() => inThrottle = false, limit)
      }
    }
  }

  const PRE_SEEK_NEEDED_BUFFERS_IN_SECONDS = 15
  const POST_SEEK_NEEDED_BUFFERS_IN_SECONDS = 30

  let currentSeek
  const myEfficientFn = throttle(async (...args) => {
    // console.log('myEfficientFn', args)
    const { currentTime } = video
    currentSeek = currentTime
    const neededChunks =
      chunks
        .filter(({ start, end }) =>
          currentTime - PRE_SEEK_NEEDED_BUFFERS_IN_SECONDS < start
          && currentTime + POST_SEEK_NEEDED_BUFFERS_IN_SECONDS > end
        )
    // console.log('neededChunks', neededChunks)
    const shouldUnbufferChunks =
      chunks
        .filter(chunk => !neededChunks.includes(chunk))
    // console.log('shouldUnbufferChunks', shouldUnbufferChunks)

    if (sourceBuffer.updating) await abort()
    for (const chunk of shouldUnbufferChunks) {
      if (!chunk.buffered) continue
      try {
        await removeChunk(chunk)
      } catch (err) {
        if (err.message !== 'No TimeRange found with this chunk') throw err
      }
    }
    for (const chunk of neededChunks) {
      if (
        chunk.buffered
        || (
          processedBytes !== fileSize
          && chunk.id + 1 === chunks.length
        )
      ) continue
      try {
        await appendChunk(chunk)
      } catch (err) {
        if (!(err instanceof Event)) throw err
        // if (err.message !== 'Failed to execute \'appendBuffer\' on \'SourceBuffer\': This SourceBuffer is still processing an \'appendBuffer\' or \'remove\' operation.') throw err
        break
      }
    }
    // }
  }, 10)

  video.addEventListener('seeking', (...args) => {
    // console.log('\n\n\n\n\n\n\n\n\nseeking', video.currentTime)
    // @ts-ignore
    myEfficientFn(...args)
  })

  video.addEventListener('timeupdate', (...args) => {
    // console.log('\n\n\n\n\n\n\n\n\ntimeupdate', video.currentTime)
    // @ts-ignore
    myEfficientFn(...args)
  })

  await appendChunk(chunks[0])
}

const makeHttpTorrent = ({ torrent }: { torrent: Torrent }) => {
  console.log(torrent)
  torrent.on('ready', () => {
    console.log('torrent ready')
    const file = torrent.files.find(file => file.name.endsWith('.mkv') || file.name.endsWith('.mp4'))
    
    // file.appendTo('body')
    console.log('file', file)
  })
  torrent.on('metadata', () => {
    console.log('torrent metadata')
  })
  torrent.on('done', (...args) => console.log('done', ...args))
  // torrent.on('download', (...args) => console.log('download', ...args))
  torrent.on('error', (...args) => console.log('error', ...args))
  torrent.on('infoHash', (...args) => console.log('infoHash', ...args))
  torrent.on('metadata', (...args) => console.log('metadata', ...args))
  torrent.on('noPeers', (...args) => console.log('noPeers', ...args))
  torrent.on('ready', (...args) => console.log('ready', ...args))
  torrent.on('ready', async () => {
    console.log('torrent ready')
    const file = torrent.files.find(file => file.name.endsWith('.mkv') || file.name.endsWith('.mp4'))

    if (!file) return

    const [stream, controller] = await new Promise<[ReadableStream<Uint8Array>, ReadableStreamDefaultController<any>]>(resolve => {
      let controller
      resolve([
        new ReadableStream({
          start: _controller => {
            controller = _controller
          }
        }),
        controller
      ])
    })


    const fileStream = file.createReadStream()
    // let i = 0
    let closed = false
    fileStream.addListener('data', chunk => {
      controller.enqueue(chunk)
      // i += chunk.length
      // console.log('i', i)
    })
    // fileStream.addListener('data', chunk => console.log('chunk', chunk) || controller.enqueue(chunk))
    fileStream.addListener('end', () => {
      if (!closed) controller.close()
      closed = true
      console.log('fileStream end')
    })
    fileStream.addListener('close', () => {
      if (!closed) controller.close()
      closed = true
      console.log('fileStream close')
    })
    fileStream.addListener('error', err => {
      controller.error(err)
      console.log('fileStream err')
    })

    playFile(stream, file.length)
    // file.appendTo('body')
    console.log('file', file)
  })
  // torrent.on('upload', (...args) => console.log('upload', ...args))
  torrent.on('warning', (...args) => console.log('warning', ...args))
  // torrent.on('wire', (...args) => console.log('wire', ...args))
}


const makeTorrent = ({ torrent, download }) => {
  console.log(torrent)
  let completed = false
  const peers: Peer[] = []
  download.update({
    pause: () => {
      download.update({ paused: true })
      torrent.destroy()
    },
    resume: () => {
      makeTorrent({ torrent: client.add(torrent.magnetURI, { store: torrent.store }), download })
      download.update({ paused: false })
    }
  })
  torrent.on('noPeers', () => {
    var peer = new SimplePeer({ initiator: true })
    let closed = false
    peer.on('connect', () => console.log('peer connected'))
    const subscription = apolloClient.subscribe({
      query: HYBRID_TORRENT_SEED,
      variables: { input: { magnetURI: torrent.magnetURI } }
    })
    subscription.subscribe(res => {
      if (!res.data?.hybridTorrentSeed?.signal || closed || peer.destroyed) return
      console.log('res.data?.hybridTorrentSeed?.signal', res.data?.hybridTorrentSeed?.signal)
      peer.signal(res.data?.hybridTorrentSeed?.signal)
    })
    peer.on('close', () => {
      closed = true
    })
    peer.on('signal', signal => apolloClient.mutate({ mutation: HYBRID_TORRENT_SEED_SIGNAL, variables: { input: { magnetURI: torrent.magnetURI, signal } } }))
    torrent.addPeer(peer)
    void console.log('torrent noPeers :)')
    download.update({ peers })

  })
  torrent.on('ready', () => {
    console.log('torrent ready')
    const file = torrent.files.find(file => file.name.endsWith('.mkv') || file.name.endsWith('.mp4'))
    playFile(torrent, file)
    // file.appendTo('body')
    console.log('file', file)
  })
  // torrent.on('warning', err => console.log('torrent warning', err))
  torrent.on('error', err => console.log('torrent err', err))
  torrent.on('infoHash', () => console.log('torrent infoHash'))
  torrent.on('metadata', () => {
    console.log('torrent metadata')
  })
  torrent.on('wire', (wire, address) => {
    console.log('torrent wire new peer', wire, address)
    peers.push({ wire, address })
  })
  torrent.on('done', () => {
    console.log('torrent done')
    completed = true
    download.update({ completed })
  })
  let lastDownloadUpdate = Date.now()
  torrent.on('download', () => {
    if (Date.now() - lastDownloadUpdate < 100) return
    lastDownloadUpdate = Date.now()
    download.update({
      paused: torrent.paused,
      bytes: torrent.downloaded,
      totalBytes: torrent.length,
      uploadedBytes: torrent.uploaded,
      downloadBandwith: torrent.downloadSpeed,
      uploadBandwith: torrent.uploadSpeed,
      remainingTime: torrent.timeRemaining,
      completed
    })
  })
}

// setTimeout(() => {
//   const video = document.createElement('video')
//   // video.autoplay = true
//   video.controls = true
//   // video.volume = 0
//   video.style.marginLeft = '200px'
//   video.addEventListener('error', err => console.log('HTMLVIDERR', err))
//   document.body.appendChild(video)
//   // video.src = `https://localhost:1234/video.mkv`
//   video.src = `http://localhost:1234/service-worker/api/73c743067193e8887c1297fd76344e622052844a`

//   // Promise.all([
//   //   fetch('https://localhost:1234/video.mkv').then(res => res.arrayBuffer()),
//   //   fetch('https://localhost:1234/service-worker/api/9d5985d36cade25d2cd21fc9ab9951cedb7e982c').then(res => res.arrayBuffer())
//   // ]).then(([arr, arr2]) => {
//   //   console.log('buffers', arr, arr2, equal(arr, arr2))
//   // })
// }, 500)

// setTimeout(() => {
//   if (!client) client = new WebTorrent()
//   let uri = 'magnet:?xt=urn:btih:ab3906b9ea36acd267e3bc638c998fb70fb5fa60&dn=%5BSubsPlease%5D%20Tokyo%20Revengers%20-%2002%20%28720p%29%20%5BE2E0B86D%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
//   // let uri = 'magnet:?xt=urn:btih:9d5985d36cade25d2cd21fc9ab9951cedb7e982c&dn=%5BHorribleSubs%5D+Ueno-san+wa+Bukiyou+-+01+%5B1080p%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
//   // let uri = 'magnet:?xt=urn:btih:b6ce4682d213fce6199874961437510683b01e99&dn=%5BSubsPlease%5D+Tensura+Nikki+-+Tensei+Shitara+Slime+Datta+Ken+-+02+(480p)+%5BF7EF4EB4%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
//   // let uri = 'magnet:?xt=urn:btih:80ca9c41042b69d12d885d974d300e84f5fc900a&dn=%5BSubsPlease%5D+Tensura+Nikki+-+Tensei+Shitara+Slime+Datta+Ken+-+02+(720p)+%5B34169E24%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
//   let filename = 'test'
//   makeTorrent({
//     torrent:
//       client.add(
//         uri + '&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com',
//         { store: function (chunkLength, opts) { return new IDBChunkStore(chunkLength, opts) } }
//       ),
//     download: makeDownload({
//       uri,
//       filename
//     })
//   })
// }, 1000)

// setTimeout(async () => {
//   const uri = `magnet:?xt=urn:btih:3a6137d8aab9a239a7d8227d0605e573e6367059&dn=%5BSubsPlease%5D%20Takt%20Op.%20Destiny%20-%2001%20%28480p%29%20%5BA189900E%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com`

//   if (!client) client = new WebTorrent()

//   // makeHttpTorrent({
//   //   torrent:
//   //     client.add(
//   //       uri + ``,
//   //       // @ts-ignore
//   //       { store: function (chunkLength, opts) { return new IDBChunkStore(chunkLength, opts) } }
//   //     ),
//   //   download: makeDownload({
//   //     uri,
//   //     filename: '[SubsPlease] Takt Op. Destiny - 01 (480p) [A189900E].mkv'
//   //   })
//   // })
//   console.log('client', client)

//   const searchParams = new URLSearchParams(uri)
//   const filename = searchParams.get('dn') ?? <string>searchParams.get('xt')

//   const res = await (await fetch(`${process.env.PROXY_ORIGIN}/${process.env.PROXY_VERSION}/torrent-file?magnet=${encodeURIComponent(uri)}`)).arrayBuffer()
//   console.log('res', res)

//   // const parsed = parseTorrent(Buffer.from(res))
//   // console.log('parsed', parsed)

//   makeHttpTorrent({
//     torrent:
//       client.add(
//         Buffer.from(res),
//         // @ts-ignore
//         { store: function (chunkLength, opts) { return new IDBChunkStore(chunkLength, opts) } }
//       ),
//     download: makeDownload({
//       uri,
//       filename
//     })
//   })


//   setTimeout(() => {
//     client.destroy()
//   }, 15000)
// }, 1000)

// todo: move the webtorrent client to its own out of process iframe
export const torrent = async ({ data: { magnet: { uri } }, installedPackage, port }) => {
  // const { send, events } = makeEventChannel(port)
  if (!client) client = new WebTorrent()
  const searchParams = new URLSearchParams(uri)
  const filename = searchParams.get('dn') ?? <string>searchParams.get('xt')
  // console.log(`torrent ${filename} added`)
  // console.log(uri + '&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com')

  const res = await (await fetch(`${process.env.PROXY_ORIGIN}/${process.env.PROXY_VERSION}/torrent-file?magnet=${encodeURIComponent(uri)}`)).arrayBuffer()

  makeHttpTorrent({
    torrent:
      client.add(
        Buffer.from(res),
        // @ts-ignore
        { store: function (chunkLength, opts) { return new IDBChunkStore(chunkLength, opts) } }
      ),
    // download: makeDownload({
    //   uri,
    //   filename
    // })
  })

  // makeTorrent({
  //   torrent:
  //     client.add(
  //       uri + '&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com',
  //       // @ts-ignore
  //       { store: function (chunkLength, opts) { return new IDBChunkStore(chunkLength, opts) } }
  //     ),
  //   download: makeDownload({
  //     uri,
  //     filename
  //   })
  // })

  // events.addEventListener('remove', () => {
  //   client.remove(uri, undefined, err => !err && console.log(`torrent ${filename} removed`))
  //   apolloClient.writeQuery({ query: REMOVE_DOWNLOAD, data: { removeDownload: { filename, uri } } })
  // })
}

export default torrent
