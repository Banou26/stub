import { groupBy } from './group-by'

export type Uri = `${string}:${string}`

type Separated<S extends string> = `${S}${''|`,${S}`}`

export type Uris = Separated<Separated<Uri>>

export type UriValues = {
  origin: string
  id: string
}

export const fromUri = (uri: Uri): UriValues => {
  const [origin, id] = uri.split(':') as [string, string]
  return { origin, id }
}

export const fromUris = <T extends string | undefined = undefined>(uriString: Uris, schemeSearch?: T): T extends string ? UriValues : UriValues[] => {
  const uris = uriString.split(',') as Uri[]
  const result =
    uris
      .filter(Boolean)
      .map((uri) => fromUri(uri))
  if (schemeSearch) return result.find(({ origin }) => origin === schemeSearch) as T extends string ? UriValues : UriValues[]
  return result as T extends string ? UriValues : UriValues[]
}

export const toUri = (
  { origin, id }:
  { origin: string, id: string }
): Uri => `${origin}:${id}`

export const joinUris = (uris: Uri[]) => uris.join(',') as Uris
export const splitUris = (uris: Uris) => uris.split(',') as Uri[]

export const isUri = (uri: string): uri is Uri => {
  const parts =
    uri
      .split(':')
      .filter(part => part.length)

  if (parts[1]?.includes(',')) throw new Error(`Invalid uri: ${uri}, contains "," character in id`)

  return parts.length === 2
}

export const isUris = (uri: string): uri is Uris =>
  uri
    .split(',')
    .every(isUri)

export type AggregatedUri = `ag:(${Uris})${''|`-${string}`}`

const SCANNARR_REGEX = /ag:\((.*)\)(?:-(.*))?/

export const isAggregatedUri = (uri: string): uri is AggregatedUri => {
  if (!uri.startsWith('ag:')) return false
  const match = uri.match(SCANNARR_REGEX)
  if (!match) return false
  const uris = match?.[1]
  // allow empty ag uris
  return !uris || isUris(uris)
}

export const toAggregatedUri = <T extends Uri[] | Uris>(uris: T, episode?: string) =>
  `ag:(${toAggregatedId(uris)})${episode ? `-${episode}` : ''}` as AggregatedUri

export const toAggregatedId = <T extends Uri[] | Uris>(uris: T, sort = true): string =>
  sort
    ? toAggregatedId(
      (
        fromUris(
          Array.isArray(uris)
            ? uris.join(',') as Uris
            : uris
        )
      )
        .filter(elem => elem.origin && elem.id)
        .sort((a, b) => a.id.localeCompare(b.id))
        .sort((a, b) => a.origin.localeCompare(b.origin))
        .map(toUri),
      false
    )
    : (
      encodeURI(
        Array.isArray(uris)
          ? uris.join(',')
          : uris
      )
    )

export const fromAggregatedUri = (uri: AggregatedUri) => {
  const match = uri.match(SCANNARR_REGEX)
  if (!match) return undefined
  const uris =
    fromUris(match[1] as Uris)
      .filter(elem => elem.origin && elem.id)
      .sort((a, b) => a.id.localeCompare(b.id))
      .sort((a, b) => a.origin.localeCompare(b.origin))
  return match && ({
    uri: `ag:(${joinUris(uris.map(toUri))})` as Uri,
    origin: 'ag' as const,
    id: `(${joinUris(uris.map(toUri))})`,
    handleUris: uris.map(toUri),
    handleUrisString: joinUris(uris.map(toUri)), // match[1] as Uris,
    handleUrisValues: uris,
    episodeId: match[2] as string
  })
}

export const mergeAggregatedUris = (uris: AggregatedUri[]) =>
  toAggregatedUri(
    [
      ...groupBy(
        uris
          .flatMap(uri =>
            fromAggregatedUri(uri as AggregatedUri)
              ?.handleUrisValues
          ),
        uri => uri.origin
      )
    ].map(([origin, uris]) =>
      toUri(
        uris
          .sort((a, b) => b.id - a.id)
          .at(-1)
      )
    ) as unknown as Uris
  )

export const matchAggregatedUris = (uri1: AggregatedUri, uri2: AggregatedUri): boolean => {
  const parsed1 = fromAggregatedUri(uri1)
  const parsed2 = fromAggregatedUri(uri2)

  if (!parsed1 || !parsed2) return false

  // Check if any inner URI from uri1 matches any inner URI from uri2
  return parsed1.handleUris.some(innerUri1 =>
    parsed2.handleUris.some(innerUri2 => innerUri1 === innerUri2)
  )
}

export const toUriEpisodeId = (uri: Uri, episodeId: string | number) => `${uri}-${episodeId}`
export const fromUriEpisodeId = (uri: Uri) => ({
  uri: [...(uri as string)].reverse().join('').split('-').slice(1).join('-').split('').reverse().join('') as Uri,
  episodeId: [...(uri as string)].reverse().join('').split('-').at(0)?.split('').reverse().join('') as string
})
