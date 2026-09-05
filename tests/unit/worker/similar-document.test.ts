// What the similarMedia funnel selects off an answer. A caller that attaches the answer as a handle
// writes the node back as a row, where an array of equal length replaces the one it finds: titles
// selected as `{ title }` alone cost crunchyroll's rows their language and score (2026-09-05), and
// `MediaTitle.language` is non-null, so a document selecting titles on that row would have errored.
import type { FieldNode, OperationDefinitionNode } from 'graphql'

import { buildASTSchema, parse, validate } from 'graphql'
import { expect, test } from 'vitest'

import { typeDefs } from '../../../src/generated/schema/typeDefs.generated'
import { SIMILAR_MEDIA_DOCUMENT } from '../../../src/worker/similar-document'

const fieldsOf = (selection: { selectionSet?: { selections: readonly unknown[] } | null | undefined }) =>
  (selection.selectionSet?.selections ?? []).filter((node): node is FieldNode => (node as FieldNode).kind === 'Field')

test('the selection is valid against the schema', () => {
  expect(validate(buildASTSchema(typeDefs), parse(SIMILAR_MEDIA_DOCUMENT))).toEqual([])
})

test('the answer\'s titles are selected whole, so an attached handle writes complete title rows', () => {
  const operation = parse(SIMILAR_MEDIA_DOCUMENT).definitions[0] as OperationDefinitionNode
  const similar = fieldsOf(operation).find(field => field.name.value === 'similarMedia')!
  const titles = fieldsOf(similar).find(field => field.name.value === 'titles')!

  expect(fieldsOf(similar).map(field => field.name.value), 'the identity, the scope the answer is checked against, the titles').toEqual(['uri', 'origin', 'id', 'url', 'scope', 'titles'])
  expect(fieldsOf(titles).map(field => field.name.value).sort(), 'every field of MediaTitle').toEqual(['language', 'score', 'title'])
})
