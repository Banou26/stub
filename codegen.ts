import type { CodegenConfig } from '@graphql-codegen/cli'

// import schema from './src/graphql'

import scannarSchema from 'scannarr/src/graphql/index'

// const config: CodegenConfig = {
//   schema,
//   generates: {
//     './src/generated/graphql.ts': {
//       plugins: ['typescript', 'typescript-resolvers', 'typescript-document-nodes'],
//       config: {
//         useTypeImports: true,
//         contextType: '../server#Context'
//       }
//     },
//     './src/generated/graphql.schema.json': {
//       plugins: ['introspection']
//     }
//   },
//   ignoreNoDocuments: true,
// }

const config: CodegenConfig = {
  schema: [scannarSchema],
  documents: ['src/**/*.ts', 'src/**/*.tsx'],
  generates: {
    './src/generated/': {
      preset: 'client',
      config: {
        withComponent: true,
        dedupeFragments: true
      },
      presetConfig: {
        gqlTagName: 'gql',
        fragmentMasking: false
      }
    }
  },
  ignoreNoDocuments: true
}

export default config
