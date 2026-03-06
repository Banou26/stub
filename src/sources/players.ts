import CrunchyrollPlayer from './crunchyroll/player'

export type PlayerProps = {
  url: string
  mediaUri: string
  episodeUri: string
  sourceUri: string
}

const players: Record<string, (props: PlayerProps) => any> = {
  cr: CrunchyrollPlayer
}

export const getPlayer = (origin: string) => players[origin]
