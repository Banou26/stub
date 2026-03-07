import CrunchyrollPlayer from './crunchyroll/player'
import NetflixPlayer from './unogs/player'

export type PlayerProps = {
  url: string
  mediaUri: string
  episodeUri: string
  sourceUri: string
}

const players: Record<string, (props: PlayerProps) => any> = {
  cr: CrunchyrollPlayer,
  nf: NetflixPlayer
}

export const getPlayer = (origin: string) => players[origin]
