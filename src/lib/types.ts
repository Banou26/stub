export interface Image {
  type: 'POSTER' | 'IMAGE'
  size: 'LARGE' | 'MEDIUM' | 'SMALL'
  url: string
}

export interface TitleName {
  language: string
  name: string
}

export interface TitleSynopsis {
  language: string
  synopsis: string
}

export interface Handle {
  scheme: string
  id: string
  uri: string
  url: string
}

export interface Title {
  names: TitleName[]
  images: Image[]
  synopses: TitleSynopsis[]
  related: Title[]
  handles: TitleHandle[]
  episodes: Episode[]
  recommended: Title[]
}

export interface TitleHandle extends Handle {
  names: TitleName[]
  images: Image[]
  synopses: TitleSynopsis[]
  related: TitleHandle[]
}

export interface Episode {
  names: TitleName[]
  images: Image[]
  handles: EpisodeHandle[]
}

export interface EpisodeHandle extends Handle {
  images: Image[]
  synopses: TitleSynopsis[]
  related: EpisodeHandle[]
}
