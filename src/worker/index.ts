import { remux } from '@banou26/oz-libav'
import { makeCallListener, registerListener } from 'osra'



const resolvers = {
  'REMUX': makeCallListener(async ({ autoStart, url }: { size?: number, stream?: ReadableStream, autoStart: boolean, url: string }) => {
    const { headers, body: bodyStream } = await fetch(url)
    const size = Number(headers.get('Content-Length'))
    if (!bodyStream || !size) throw new Error('no stream or Content-Length returned from the response')
    console.log('REMUX WORKER', size, bodyStream)
    const { stream, getInfo } = await remux({ size, stream: bodyStream, autoStart })
    return { fileSize: size, stream, getInfo }
  }), 
  'TEST': makeCallListener(({ foo, buffer }: { foo: string, buffer: ArrayBuffer }) => {
    console.log('TEST foo', foo, buffer)
    return {
      foo: 'foo',
      buffer: new Uint8Array(1024 * 1024 * 8).buffer
    }
  })
}

export type Resolvers = typeof resolvers

registerListener({ target: globalThis, resolvers })

console.log('WORKER YEEEEEEEEEET')
globalThis.addEventListener('message', (ev) => {
  console.log('worker ev', ev)
})


