import CrunchyrollPlayer from './crunchyroll/player'

export type PlayerProps = { url: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const players: Record<string, ((props: PlayerProps) => any) | undefined> = {
  cr: CrunchyrollPlayer
}
