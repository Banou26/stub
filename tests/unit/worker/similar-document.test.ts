// What the similarMedia funnel selects off an answer. A caller that attaches the answer as a handle
// writes the node back as a row, where an array of equal length replaces the one it finds: titles
// selected as `{ title }` alone cost crunchyroll's rows their language and score (2026-09-05), and
// `MediaTitle.language` is non-null, so a document selecting titles on that row would have errored.
//
// The EPISODES are selected for a different reason, and the document carried none until 2026-09-10.
// `useOnResolve` fires per resolved field on that field's named type, so an unselected `episodes` is a
// resolver that never runs and an `episodeInserter` that never fires, while `mediaInserter` drops
// `media.episodes` on the floor. A source reaching the app only through this document therefore landed
// its media and none of its episodes, which is what left every Netflix episode row without a source.
import type { FieldNode, OperationDefinitionNode } from 'graphql'

import { buildASTSchema, parse, validate } from 'graphql'
import { expect, test } from 'vitest'

import { typeDefs } from '../../../src/generated/schema/typeDefs.generated'
import { SIMILAR_MEDIA_DOCUMENT } from '../../../src/worker/similar-document'

const fieldsOf = (selection: { selectionSet?: { selections: readonly unknown[] } | null | undefined }) =>
  (selection.selectionSet?.selections ?? []).filter((node): node is FieldNode => (node as FieldNode).kind === 'Field')

const names = (selection: Parameters<typeof fieldsOf>[0]) => fieldsOf(selection).map(field => field.name.value)

const similarMedia = () => {
  const operation = parse(SIMILAR_MEDIA_DOCUMENT).definitions[0] as OperationDefinitionNode
  return fieldsOf(operation).find(field => field.name.value === 'similarMedia')!
}

test('the selection is valid against the schema', () => {
  expect(validate(buildASTSchema(typeDefs), parse(SIMILAR_MEDIA_DOCUMENT))).toEqual([])
})

test('the answer\'s titles are selected whole, so an attached handle writes complete title rows', () => {
  const similar = similarMedia()
  const titles = fieldsOf(similar).find(field => field.name.value === 'titles')!

  expect(names(similar), 'the identity, the scope the answer is checked against, the titles, the episodes').toEqual(['uri', 'origin', 'id', 'url', 'scope', 'titles', 'episodes'])
  expect(names(titles).sort(), 'every field of MediaTitle').toEqual(['language', 'score', 'title'])
})

// The list is `normalizeToStoreEpisode` in worker/extractor.ts, which is what an inserted row keeps.
// A field missing here is a column the store cannot fill for any source that arrives this way, and
// `episodeNumber` in particular is the ONLY key episodes are joined on across sources
// (`mergeByEpisodeNumber`), so an episode selected without it can never reach a row.
test('every field the store keeps off an episode is selected', () => {
  const episodes = fieldsOf(similarMedia()).find(field => field.name.value === 'episodes')

  expect(episodes, 'an unselected episodes field is an episodeInserter that never fires').toBeDefined()
  expect(names(episodes!).sort()).toEqual([
    'absoluteEpisodeNumber', 'descriptions', 'embedUrl', 'episodeNumber', 'id', 'mediaUri', 'origin',
    'releaseDate', 'runtime', 'score', 'seasonNumber', 'shortDescriptions', 'thumbnails', 'titles',
    'uri', 'url'
  ])
})

// Same rule as the media titles above, applied to every array an episode carries: the row is written
// back with what was asked for, so a partial selection truncates everyone else's copy of it.
test('every array on an episode is selected whole', () => {
  const episodes = fieldsOf(similarMedia()).find(field => field.name.value === 'episodes')!
  const sub = (name: string) => fieldsOf(episodes).find(field => field.name.value === name)!

  expect(names(sub('titles')).sort(), 'EpisodeTitle').toEqual(['language', 'score', 'title'])
  expect(names(sub('descriptions')).sort(), 'EpisodeDescription').toEqual(['description', 'language', 'score'])
  expect(names(sub('shortDescriptions')).sort(), 'EpisodeShortDescription').toEqual(['language', 'score', 'shortDescription'])
  expect(names(sub('thumbnails')).sort(), 'EpisodeThumbnail').toEqual(['color', 'height', 'language', 'score', 'url', 'width'])
})
