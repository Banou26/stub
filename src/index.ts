import { fetch, torrent } from '@oz/package-api'

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

const uri =
`\
magnet:?\
xt=urn:btih:8c0d8e6ec6280fba1e1e96648ede7be22e84123a&\
dn=%5BSubsPlease%5D+Kumo+desu+ga%2C+Nani+ka+-+07+(1080p)+%5B744F20F9%5D.mkv&\
tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&\
tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&\
tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&\
tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&\
tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&\
tr=wss%3A%2F%2Ftracker.btorrent.xyz&\
tr=wss%3A%2F%2Ftracker.openwebtorrent.com
`

// `magnet:?xt=urn:btih:776fe51d8440226a8a6d92d3d5b21ec3455e588a&dn=The.Mandalorian.S02E04.WEBRip.x264-ION10&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2920%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.pirateparty.gr%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.cyberia.is%3A6969%2Fannounce&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com`

const torrentSubscription = torrent({
  uri
})

// setTimeout(() => {
//   torrentSubscription.unsubscribe()
// }, 25000)

enum RARBGCategories {
  MOVIES = 'movies',
  TV = 'tv',
  GAMES = 'games',
  MUSIC = 'music',
  ANIME = 'anime',
  APPS = 'apps',
  DOCUMENTARIES = 'documentaries',
  OTHER = 'other',
  XXX = 'xxx'
}

const searchRARBG = (search = '', categories: RARBGCategories[] = [RARBGCategories.MOVIES, RARBGCategories.TV]) =>
  fetch(`https://rargb.to/search/?${
    search
    ? `search=${globalThis.encodeURI(search)}${categories.length ? '&' : ''}`
    : ''
  }${
    categories
      .map(category => `category[]=${category}`)
      .join('&')
  }`).then(res => {
    console.log(res)
    return res.text()
  })

const getGoogleCardInfos = (elem: HTMLElement) => ({
    image: (<HTMLElement>elem.querySelector('img'))?.dataset.src,
    title: elem.querySelector('[role="heading"]')?.textContent?.trim()
  })

const filterUniqueArray =
  (func: (obj: any) => string) =>
    (arr: any[]) =>
      [...new Set(arr.map(func))]
        .map(key =>
          arr.find(item => func(item) === key)
        )

const findUniqueGoogleResults = filterUniqueArray(({ title }) => title)

const getGoogleLatestMovies = () =>
  fetch(
    'https://encrypted.google.com/search?q=latest+movies&hl=en&gl=en#safe=active&hl=en&gl=en&q=%s',
    {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'dnt': '1',
        'pragma': 'no-cache',
        'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="90", "Google Chrome";v="90"',
        'sec-ch-ua-mobile': '?0',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': navigator.userAgent
      },
      "referrer": "https://www.google.com/"
    }
  )
    .then(async res => {
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
      const movieElements = [...doc.querySelectorAll('[data-item-card="true"]')]
      const movieNames = movieElements.map(getGoogleCardInfos)

      const scriptElements = [...doc.querySelectorAll('script')]
      const moviesScriptElement = scriptElements.find(elem => elem.textContent?.includes('window.jsl.dh'))
      const movieScript = moviesScriptElement?.innerText

      const results =
        Array
          .from(movieScript?.matchAll(/window\.jsl\.dh\('.*?','(.*?)'\);/gm) ?? [])
          .map(escapedString =>
            escapedString[1].replaceAll(
              /\\x../gm,
              hex =>
                String.fromCharCode(
                  parseInt(
                    Number(`0x${hex.slice(2)}`).toString(),
                    10
                  )
                )
            )
          )
          .flatMap(str =>
            [
              ...new DOMParser()
                .parseFromString(str, 'text/html')
                .querySelectorAll('[data-item-card="true"]')
            ]
          )
          .map(getGoogleCardInfos)

      return findUniqueGoogleResults([...movieNames, ...results])
  })

// const latestMoviesGoogle =
//   getGoogleLatestMovies()
//     .then(async movies => [
//       movies,
//       await Promise.all(
//         movies
//           .slice(0, 1)
//           .map(async movie =>
//             new DOMParser()
//               .parseFromString(
//                 await searchRARBG(movie.title),
//                 'text/html'
//               )
//           )
//       )
//     ])
//     .then(([movies, rarbgSearch]) => {
//       const rarbgSeeds = rarbgSearch.map(doc => {
//         const tableRows =
//           [...doc.querySelectorAll('body > table:nth-child(6) > tbody > tr > td:nth-child(2) > div > table > tbody > tr:nth-child(2) > td > table.lista2t > tbody > tr')]
//             .slice(1)
//             .map(rowElem => ({
//               link: rowElem.querySelector('td:nth-child(2) > a').getAttribute('href'),
//               title: rowElem.querySelector('td:nth-child(2) > a').textContent.trim(),
//               seedNumber: rowElem.querySelector('td:nth-child(6)').textContent.trim()
//             }))
//         console.log(tableRows)
//         // const table = doc.querySelectorAll('body > table:nth-child(6) > tbody > tr > td:nth-child(2) > div > table > tbody > tr:nth-child(2) > td > table.lista2t > tbody > tr > td:nth-child(6)')
//       })
//       console.log(movies)
//       // console.log(rarbgSearch)
//       rarbgSearch.forEach(doc => console.log())
//     })
