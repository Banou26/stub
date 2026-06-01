export type StreamingPlatform = {
  id: string
  name: string
  url: string
  icon: string
  color: string
}

// Metadata for the major streaming platforms surfaced by JustWatch's where-to-watch
// offers (see PROVIDER_MAP in justwatch/extractor.ts). Netflix (nf) and Crunchyroll (cr)
// already get their metadata from their own extractors, so they are not listed here.
// These origins carry no in-app player yet — playback links out to the platform.
export const streamingPlatforms: StreamingPlatform[] = [
  { id: 'disney', name: 'Disney+', url: 'https://www.disneyplus.com', icon: 'https://www.disneyplus.com/favicon.ico', color: '#0063e5' },
  { id: 'amazon', name: 'Prime Video', url: 'https://www.primevideo.com', icon: 'https://www.primevideo.com/favicon.ico', color: '#00a8e1' },
  { id: 'appletv', name: 'Apple TV+', url: 'https://tv.apple.com', icon: 'https://tv.apple.com/favicon.ico', color: '#e8e8ed' },
  { id: 'hulu', name: 'Hulu', url: 'https://www.hulu.com', icon: 'https://www.hulu.com/favicon.ico', color: '#1ce783' },
  { id: 'hbo', name: 'Max', url: 'https://www.max.com', icon: 'https://www.max.com/favicon.ico', color: '#7b5cff' },
  { id: 'peacock', name: 'Peacock', url: 'https://www.peacocktv.com', icon: 'https://www.peacocktv.com/favicon.ico', color: '#069de0' },
  { id: 'paramount', name: 'Paramount+', url: 'https://www.paramountplus.com', icon: 'https://www.paramountplus.com/favicon.ico', color: '#0064ff' },
  { id: 'fubo', name: 'Fubo', url: 'https://www.fubo.tv', icon: 'https://www.fubo.tv/favicon.ico', color: '#fa4616' },
]
