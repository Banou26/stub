// import { css } from '@emotion/react'

// import { DetailedHTMLProps, HTMLAttributes, useEffect, useRef, useState } from 'react'
// // import { playFile, torrent as downloadTorrent } from './torrent'
// import FKNMediaPlayer from 'fkn-media-player'



// const style = css`
//   margin: auto;
//   height: 100%;

//   & > div {
//     height: 100%;
//     video {
//       height: 100%;
//     }
//   }
// `

// export default ({ torrentFile, ...rest }: { torrentFile?: ArrayBuffer } & DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>) => {
//   const [size, setSize] = useState<number>()
//   const [stream, setStream] = useState<ReadableStream<Uint8Array>>()

//   useEffect(() => {
//     const url = `${process.env.PROXY_ORIGIN}/${process.env.PROXY_VERSION}/torrent/${encodeURIComponent(uri)}`
//     const magnet = 'magnet:?xt=urn:btih:3adc676e57c525d2b91b82f8b2b56a06da3a487f&dn=%5BSubsPlease%5D+Spy+x+Family+-+03+(1080p)+%5B369CC4DE%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'

//     fetch(`http://localhost:4001/v0/torrent/${encodeURIComponent(magnet)}`)
//     // fetch('./video2.mkv')
//     // fetch('./video4.mkv')
//       .then(({ headers, body }) => {
//         if (!body || !headers.get('Content-Length')) throw new Error('no stream or Content-Length returned from the response')
//         setSize(Number(headers.get('Content-Length')))
//         setStream(body)
//       })
//   }, [])
//   return (
//     <div css={style} {...rest}>
//       <div>
//         <FKNMediaPlayer id={'test'} size={size} stream={stream}/>
//       </div>
//     </div>
//   )
// }
