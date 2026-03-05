import CrunchyrollPlayer from './crunchyroll/player'

export type PlayerProps = { url: string }

const players: { match: (url: URL) => boolean, component: (props: PlayerProps) => any }[] = [
  {
    match: (url) => url.hostname.endsWith('crunchyroll.com'),
    component: CrunchyrollPlayer
  }
]

export const getPlayer = (url: string) => {
  try {
    const parsed = new URL(url)
    return players.find(p => p.match(parsed))?.component
  } catch {
    return undefined
  }
}
