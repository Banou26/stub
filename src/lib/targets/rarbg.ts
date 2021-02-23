

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

enum SearchableCategories {
  MOVIES = RARBGCategories.MOVIES,
  TV = RARBGCategories.TV,
  ANIME = RARBGCategories.ANIME,
  DOCUMENTARIES = RARBGCategories.DOCUMENTARIES,
  PORNOGRAPHY = RARBGCategories.XXX,
  OTHER = RARBGCategories.OTHER
}

export const search = ({ search = '', categories = [SearchableCategories.MOVIES, SearchableCategories.TV ] }: { search: string, categories: SearchableCategories[]}) =>
  fetch(`https://rargb.to/search/?${
    search
    ? `search=${globalThis.encodeURI(search)}${categories.length ? '&' : ''}`
    : ''
  }${
    categories
      .map(category => `category[]=${category}`)
      .join('&')
  }`).then(async res => {
    const pageSource = await res.text()
    const pageDocument = new DOMParser().parseFromString(pageSource, 'text/html')
    return (
      [...pageDocument.querySelectorAll('body > table:nth-child(6) > tbody > tr > td:nth-child(2) > div > table > tbody > tr:nth-child(2) > td > table.lista2t > tbody > tr')]
        // remove table headers
        .slice(1)
        .map(rowElem => ({
          link: rowElem.querySelector('td:nth-child(2) > a')?.getAttribute('href'),
          title: rowElem.querySelector('td:nth-child(2) > a')?.textContent?.trim(),
          seedNumber: rowElem.querySelector('td:nth-child(6)')?.textContent?.trim()
        }))
    )
  })
