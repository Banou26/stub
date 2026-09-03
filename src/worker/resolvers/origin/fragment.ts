import { gql } from '../../../generated'

// MediaFragment lives in ../media/fragment.ts and is registered globally by name, so it does not need
// importing to be spread. A byte-identical SECOND copy used to sit here, and two definitions of one
// fragment name abort the whole codegen write step: `Not all fragments have an unique name`. The run
// still reports `[SUCCESS] Generate outputs`, so nothing looked wrong while src/generated went four
// days without being rewritten (mtimes 2026-08-31 against a schema edited since).

export const ORIGIN_FRAGMENT = gql(`
  fragment OriginFragment on Origin {
    id
    url
    name
    icon
    color
    isApiOnly
  }
`)
