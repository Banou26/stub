import { fetch, torrent } from '@oz/package-api'
import './lib'

fetch(
  'https://webtoon-phinf.pstatic.net/20200407_127/1586210898798HCxEY_PNG/158621089877210933325.png?type=opti',
  {
    headers: {
      referer: 'https://www.webtoons.com/'
    }
  }
)
  .then(res => res.blob())
  .then(blob => URL.createObjectURL(blob))
  .then(url => {
    const img = document.createElement('img')
    img.src = url
    document.body.appendChild(img)
  })

const uri =
  `magnet:?xt=urn:btih:e09042f496d729202b389421a35cd55e6a24f0f6&dn=%5BErai-raws%5D+Mushoku+Tensei+-+Isekai+Ittara+Honki+Dasu+-+01+%5B540p%5D%5BMultiple+Subtitle%5D.mkv&tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce`
  

// const uri =
// `\
// magnet:?\
// xt=urn:btih:9d5985d36cade25d2cd21fc9ab9951cedb7e982c&\
// dn=%5BHorribleSubs%5D+Ueno-san+wa+Bukiyou+-+01+%5B1080p%5D.mkv&\
// tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&\
// tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&\
// tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&\
// tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&\
// tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&\
// tr=wss%3A%2F%2Ftracker.btorrent.xyz&\
// tr=wss%3A%2F%2Ftracker.openwebtorrent.com\
// `

// const uri =
// `\
// magnet:?\
// xt=urn:btih:8c0d8e6ec6280fba1e1e96648ede7be22e84123a&\
// dn=%5BSubsPlease%5D+Kumo+desu+ga%2C+Nani+ka+-+07+(1080p)+%5B744F20F9%5D.mkv&\
// tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&\
// tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&\
// tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&\
// tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&\
// tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&\
// tr=wss%3A%2F%2Ftracker.btorrent.xyz&\
// tr=wss%3A%2F%2Ftracker.openwebtorrent.com
// `

// `magnet:?xt=urn:btih:776fe51d8440226a8a6d92d3d5b21ec3455e588a&dn=The.Mandalorian.S02E04.WEBRip.x264-ION10&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2920%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.pirateparty.gr%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.cyberia.is%3A6969%2Fannounce&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com`

const torrentSubscription = torrent({
  uri
})

// setTimeout(() => {
//   torrentSubscription.unsubscribe()
// }, 25000)

