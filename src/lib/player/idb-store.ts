// https://github.com/MinEduTDF/idb-chunk-store
import type { ReadStream } from 'fs'
import type { Peer } from './'
import { EventEmitter } from 'events'
import inherits from 'inherits'

import { openDB, DBSchema } from 'idb'

export interface Download {
  id: string
  uri: string
  filename: string
  date: Date
  icon: string | ArrayBuffer | (() => JSX.Element) | null
  bytes: number
  totalBytes: number | null
  uploadedBytes: number | null
  hashAlgo: string | null
  hash: string | null
  // installedPackage: InstalledPackage | null
  stream: ReadStream | null
  buffer: ArrayBuffer | Buffer | null
  remainingTime: number | null
  downloadBandwith: number | null
  uploadBandwith: number | null
  completed: boolean
  paused: boolean
  pause: Function | null
  resume: Function | null
  torrent: null | {
    torrent: any,
    peers: Peer[]
  }
}

export interface DownloadDB extends
  Pick<
    Download,
    'id'
    | 'uri'
    | 'filename'
    | 'date'
    | 'bytes'
    | 'totalBytes'
    | 'hashAlgo'
    | 'hash'
  > {
    icon: Exclude<Download['icon'], Function>
    installedPackage: string
    mime: string
    buffers: ArrayBuffer[]
    file: File
    blob: Blob
}

interface DownloadsDB extends DBSchema {
  index: {
    key: IDBValidKey
    value: DownloadDB[]
    indexes: {
      id: IDBValidKey
    }
  }
  chunks: {
    key: IDBValidKey
    value: ArrayBuffer[]
  }
}

export const db =
  openDB<DownloadsDB>('downloads', 1, {
    upgrade(db) {
      db.createObjectStore('index', {
        keyPath: 'id'
      })
      db.createObjectStore('chunks')
    }
  })

inherits(Storage, EventEmitter)

const nextTick =
  (cb: Function, err?: Error | null, val?: any) =>
    process.nextTick(() => cb?.(err, val))

export default function Storage (chunkLength, opts) {
  // @ts-ignore
  if (!(this instanceof Storage)) return new Storage(chunkLength, opts)
  if (!opts) opts = {}
  EventEmitter.call(this)
  this.setMaxListeners(100)

  this.chunkLength = Number(chunkLength)
  if (!this.chunkLength) throw new Error('First argument must be a chunk length')

  this.closed = false
  this.length = Number(opts.length) || Infinity

  if (this.length !== Infinity) {
    this.lastChunkLength = (this.length % this.chunkLength) || this.chunkLength
    this.lastChunkIndex = Math.ceil(this.length / this.chunkLength) - 1
  }
  this.name = opts.name
  this._ready = false

  db.then(() => this.emit('ready'))

  // const request = idb.open(opts.name || 'chunksDB')
  // request.addEventListener('upgradeneeded', function () {
  //   const db = request.result
  //   db.createObjectStore('chunks')
  // })
  // request.addEventListener('success', function () {
  //   this.db = request.result
  //   this.emit('ready')
  // })
}

Storage.prototype.put = function (index, buf, cb) {
  if (this.closed) return nextTick(cb, new Error('Storage is closed'))

  const isLastChunk = (index === this.lastChunkIndex)
  if (isLastChunk && buf.length !== this.lastChunkLength) {
    return nextTick(cb, new Error('Last chunk length must be ' + this.lastChunkLength))
  }
  if (!isLastChunk && buf.length !== this.chunkLength) {
    return nextTick(cb, new Error('Chunk length must be ' + this.chunkLength))
  }
  db
    .then(db => db.put('chunks', buf, `${this.name}-${index}`))
    .then(value => cb(null, value))
    .catch(cb)
  // this._store('readwrite', function (err, store) {
  //   if (err) return cb(err)
  //   backify(store.put(buf, index), wait(store, cb))
  // })
}

function wait (store, cb) {
  let pending = 2
  store.transaction.addEventListener('complete', done)
  return function (err) {
    if (err) cb(err)
    else done()
  }
  function done () { if (cb && --pending === 0) cb(null) }
}

Storage.prototype.get = function (index, opts, cb) {
  if (typeof opts === 'function') return this.get(index, null, opts)
  if (this.closed) return nextTick(cb, new Error('Storage is closed'))

  db
    .then(db => db.get('chunks', `${this.name}-${index}`))
    .then(async value => {
      if (value === undefined) {
        cb(null, Buffer.alloc(0))
      } else {
        // @ts-ignore
        const buf = Buffer.from(value)
        if (!opts) return cb(null, buf)
        const offset = opts.offset || 0
        const len = opts.length || (buf.length - offset)

        if (opts.offset === 0 && len === buf.length - offset) {
          return cb(null, buf)
        }

        cb(null, buf.slice(offset, len + offset))
      }
    })
    .catch(cb)

  // this._store('readonly', function (err, store) {
  //   if (err) {
  //     cb(err)
  //   } else {
  //     backify(store.get(index), function (err, ev) {
  //       if (err) {
  //         cb(err)
  //       } else if (ev.target.result === undefined) {
  //         cb(null, Buffer.alloc(0))
  //       } else {
  //         const buf = Buffer.from(ev.target.result)
  //         if (!opts) return cb(null, buf)
  //         const offset = opts.offset || 0
  //         const len = opts.length || (buf.length - offset)

  //         if (opts.offset === 0 && len === buf.length - offset) {
  //           return cb(null, buf)
  //         }

  //         cb(null, buf.slice(offset, len + offset))
  //       }
  //     })
  //   }
  // })
}

Storage.prototype.close = Storage.prototype.destroy = function (cb) {
  if (this.closed) return nextTick(cb, new Error('Storage is closed'))
  if (!this.db) return nextTick(cb, undefined)
  this.closed = true
  // self.db.close()
  nextTick(cb, null)
}

// function nextTick (cb, err, val) {
//   queueMicrotask(function () {
//     if (cb) cb(err, val)
//   })
// }

function backify (r, cb) {
  r.addEventListener('success', function (ev) { cb(null, ev) })
  r.addEventListener('error', function (err) { cb(err) })
}
