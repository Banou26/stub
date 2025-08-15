import type { CodegenConfig } from '@graphql-codegen/cli'

import { defineConfig } from '@eddeee888/gcg-typescript-resolver-files'

const config: CodegenConfig = {
  schema: './**/*.gql',
  generates: {
    './src/generated/schema': defineConfig({
      resolverGeneration: 'disabled',
      scalarsOverrides: {
        Date: {
          type: 'string'
        }
      }
    }),
    './src/generated/graphql.ts': {
      plugins: [
        'typescript',
        'typescript-resolvers',
        'typescript-document-nodes',
      ],
      config: {
        useTypeImports: true,
        contextType: '../worker/yoga#ServerContext',
        scalars: {
          Date: 'string'
        }
      }
    },
    './src/generated/graphql.schema.json': {
      plugins: [
        'urql-introspection'
      ],
      config: {
        scalars: {
          Date: 'string'
        }
      }
    }
  },
  ignoreNoDocuments: true,
}

export default config
