import type { CodegenConfig } from '@graphql-codegen/cli'

import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files'

const config: CodegenConfig = {
  // SCOPED TO src, which is where all five .gql files are. The glob used to be './**/*.gql', which
  // walks node_modules too, and some dependency trees there contain circular symlinks: codegen then
  // dies with ELOOP on a path repeating one directory thirty times, reported as "Failed to find any
  // GraphQL type definitions". Nothing is wrong with the schema when that happens (2026-09-08).
  schema: './src/**/*.gql',
  generates: {
    './src/generated/schema': defineConfig({
      resolverGeneration: 'disabled',
      scalarsOverrides: {
        Date: {
          type: 'string'
        }
      }
    }),
    './src/generated/graphql.schema.json': {
      plugins: [
        'urql-introspection'
      ],
      config: {
        scalars: {
          Date: 'string'
        }
      }
    },
    './src/generated/': {
      preset: 'client',
      presetConfig: {
        gqlTagName: 'gql',
        fragmentMasking: false
      },
      config: {
        useTypeImports: true,
        contextType: '../worker/yoga#ServerContext',
        scalars: {
          Date: 'string'
        }
      }
    }
  },
  documents: ['src/**/*.ts', 'src/**/*.tsx'],
  ignoreNoDocuments: true,
}

export default config
