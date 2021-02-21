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

const uri =
`\
magnet:?\
xt=urn:btih:9d5985d36cade25d2cd21fc9ab9951cedb7e982c&\
dn=%5BHorribleSubs%5D+Ueno-san+wa+Bukiyou+-+01+%5B1080p%5D.mkv&\
tr=http%3A%2F%2Fnyaa.tracker.wf%3A7777%2Fannounce&\
tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&\
tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&\
tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&\
tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&\
tr=wss%3A%2F%2Ftracker.btorrent.xyz&\
tr=wss%3A%2F%2Ftracker.openwebtorrent.com\
`
// `magnet:?xt=urn:btih:776fe51d8440226a8a6d92d3d5b21ec3455e588a&dn=The.Mandalorian.S02E04.WEBRip.x264-ION10&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2920%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.pirateparty.gr%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.cyberia.is%3A6969%2Fannounce&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com`

// const torrentSubscription = torrent({
//   uri
// })

// setTimeout(() => {
//   torrentSubscription.unsubscribe()
// }, 25000)

// const setGoogleLanguageToEnglish = (headers = {}) =>
//   fetch("https://www.google.com/setprefs?x", {
//     "headers": {
//       "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
//       "accept-language": "en-US,en;q=0.9",
//       "cache-control": "no-cache",
//       "pragma": "no-cache",
//       "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"90\", \"Google Chrome\";v=\"90\"",
//       "sec-ch-ua-mobile": "?0",
//       "sec-fetch-dest": "document",
//       "sec-fetch-mode": "navigate",
//       "sec-fetch-site": "same-origin",
//       "sec-fetch-user": "?1",
//       "upgrade-insecure-requests": "1"
//     },
//     "referrer": "https://www.google.com/",
//     "referrerPolicy": "origin",
//     "body": null,
//     "method": "GET",
//     "mode": "cors",
//     "credentials": "include",
//     ...headers
//   });

// const fetchGoogleLatestMoviesPage = (headers = {}) =>
//   fetch(
//     'https://www.google.com/search?q=latest+movies',
//     {
//       headers: {
//         "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
//         "accept-encoding": "gzip, deflate, br",
//         "accept-language": "en-US,en;q=0.9",
//         "cache-control": "no-cache",
//         "dnt": "1",
//         "pragma": "no-cache",
//         "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"90\", \"Google Chrome\";v=\"90\"",
//         "sec-ch-ua-mobile": "?0",
//         "sec-fetch-dest": "document",
//         "sec-fetch-mode": "navigate",
//         "sec-fetch-site": "same-origin",
//         "sec-fetch-user": "?1",
//         "upgrade-insecure-requests": "1",
//         "user-agent": navigator.userAgent
//       }
//     }
//   )
// https://www.google.com/search?q=latest+movies
// https://encrypted.google.com/search?q=latest+movies&hl=en&gl=en#safe=active&hl=en&gl=en&q=%s
// const setGoogleLanguageToEnglish = (headers = {}) =>
//   fetch('https://www.google.com/setprefs?x', {
    // fetch('https://www.google.com/setprefs?x', {
//     headers: {
//       'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
//       'accept-language': 'en-US,en;q=0.9',
//       'cache-control': 'no-cache',
//       'pragma': 'no-cache',
//       'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="90", "Google Chrome";v="90"',
//       'sec-ch-ua-mobile': '?0',
//       'sec-fetch-dest': 'document',
//       'sec-fetch-mode': 'navigate',
//       'sec-fetch-site': 'same-origin',
//       'sec-fetch-user': '?1',
//       'upgrade-insecure-requests': '1',
//       ...headers
//     }
//   })

const fetchGoogleLatestMoviesPage = (headers = {}) =>
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
        'user-agent': navigator.userAgent,
        ...headers
      },
      "referrer": "https://www.google.com/"
    }
  )

// const getSetCookies = (cookies: [string, string][]) =>
//   cookies
//     .filter(([name]) => name === 'setcookie')
//     .map(([_, value]) => value)

// const getCookieNameValue = (cookie: string) =>
//   cookie
//     .slice(0, cookie.indexOf(';'))

// const getCookiesValues = (cookies: string[]) =>
//   [
//     ...new Set(
//       cookies
//         .flatMap(cookie => cookie.split(','))
//         .map(getCookieNameValue)
//         .filter(cookie => cookie.includes('='))
//     )
//   ]

// const getCookieEntries = (cookies: string[]) =>
//   cookies
//     .map(cookie =>
//       [
//         cookie.slice(0, cookie.indexOf('=')),
//         cookie.slice(cookie.indexOf('=') + 1)
//       ]
//     )

const latestMoviesGoogle =
  // fetchGoogleLatestMoviesPage({ cookie: 'x' })
  fetchGoogleLatestMoviesPage()
    // .then(async res => {
    //   const setCookies = getSetCookies([...res.headers.entries()])
    //   const cookie = getCookiesValues(setCookies).join(';')
    //   console.log('cookie', cookie)
    //   return [setCookies, await setGoogleLanguageToEnglish({ cookie })]
    // })
    // .then(([_setCookies, res]: [string[], Response]) => {

    //   const setCookies2 = {
    //     ...Object.fromEntries(getCookieEntries(getCookiesValues(_setCookies))),
    //     ...Object.fromEntries(getCookieEntries(getCookiesValues(getSetCookies([...res.headers.entries()]))))
    //   }// [...new Set([..._setCookies, ...getCookiesValues(getSetCookies([...res.headers.entries()]))])]
    //   const setCookies = Object.entries(setCookies2).map(([name, value]) => `${name}=${value}`)
    //   console.log('OOF', setCookies)
    //   const cookie = setCookies.join(';')
    //   console.log('cookie', cookie)
    //   return fetchGoogleLatestMoviesPage({ cookie })
    // })
    .then(async res => {
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
      const movieElements = [...doc.querySelectorAll('[data-item-card="true"]')]
      const movieNames = movieElements.map(elem => elem.textContent?.trim())

      const scriptElements = [...doc.querySelectorAll('script')]
      const moviesScriptElement = scriptElements.find(elem => elem.textContent?.includes('window.jsl.dh'))
      const movieScript = moviesScriptElement?.innerText

      const results =
        Array
          .from(movieScript?.matchAll(/window\.jsl\.dh\('.*?','(.*?)'\);/gm) ?? [])
          .map(escapedString => escapedString[1].replaceAll(/\\x../gm, hex => String.fromCharCode(parseInt(Number(`0x${hex.slice(2)}`).toString(), 10))))
          .flatMap(str =>
            [
              ...new DOMParser()
                .parseFromString(str, 'text/html')
                .querySelectorAll('[data-item-card="true"]')
            ]
          )
          .map(elem => elem.textContent?.trim())
          // .filter(doc => doc.querySelector('[data-item-card="true"]'))
          // .map(doc => doc.querySelectorAll('[data-item-card="true"]'))

      console.log('movieNames', movieNames)
      console.log(results)
  })
