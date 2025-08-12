import { readFile, writeFile } from 'fs/promises'
import internals from '@prisma/internals'
import path from 'path'

async function generateGraphQLSchema() {
  const prismaSchema = await readFile('./prisma/schema.prisma', 'utf8')

  const dmmf = await internals.getDMMF({
    datamodel: prismaSchema
  })

  const typeMapping: Record<string, string> = {
    'String': 'String',
    'Int': 'Int',
    'Float': 'Float',
    'Boolean': 'Boolean',
    'DateTime': 'DateTime',
    'Json': 'JSON',
    'Decimal': 'Float',
    'BigInt': 'String',
    'Bytes': 'String'
  }

  function mapPrismaTypeToGraphQL(type: string): string {
    return typeMapping[type] || 'String'
  }

  function generateEnumType(enumType: any): string {
    const values = enumType.values.map((v: any) => {
      const comment = v.documentation ? `  "${v.documentation}"\n  ` : '  '
      return `${comment}${v.name}`
    }).join('\n')

    return `enum ${enumType.name} {\n${values}\n}`
  }

  function generateFieldType(field: any, model: any): string {
    let type: string

    if (field.kind === 'scalar') {
      type = mapPrismaTypeToGraphQL(field.type)
    } else if (field.kind === 'enum') {
      type = field.type
    } else if (field.kind === 'object') {
      type = field.type
      if (field.isList) {
        type = `[${type}!]`
      }
    } else {
      type = 'String'
    }

    if (field.isList && field.kind !== 'object') {
      type = `[${type}!]`
    }

    if (field.isRequired && field.kind !== 'object') {
      type = `${type}!`
    }

    return type
  }

  function generateModelType(model: any): string {
    const fields = model.fields.map((field: any) => {
      const documentation = field.documentation ? `  "${field.documentation}"\n  ` : '  '
      const fieldType = generateFieldType(field, model)
      return `${documentation}${field.name}: ${fieldType}`
    }).join('\n')

    return `type ${model.name} {\n${fields}\n}`
  }

  function generateInputType(model: any, suffix: string): string {
    const scalarAndEnumFields = model.fields.filter((field: any) =>
      field.kind === 'scalar' || field.kind === 'enum'
    )

    const fields = scalarAndEnumFields.map((field: any) => {
      let type = field.kind === 'scalar'
        ? mapPrismaTypeToGraphQL(field.type)
        : field.type

      if (field.isList) {
        type = `[${type}!]`
      }

      const isRequired = suffix === 'CreateInput' && field.isRequired && !field.hasDefaultValue
      if (isRequired) {
        type = `${type}!`
      }

      return `  ${field.name}: ${type}`
    }).join('\n')

    return `input ${model.name}${suffix} {\n${fields}\n}`
  }

  function generateWhereInput(model: any): string {
    const scalarAndEnumFields = model.fields.filter((field: any) =>
      field.kind === 'scalar' || field.kind === 'enum'
    )

    const fields: string[] = []

    scalarAndEnumFields.forEach((field: any) => {
      const baseType = field.kind === 'scalar'
        ? mapPrismaTypeToGraphQL(field.type)
        : field.type

      fields.push(`  ${field.name}: ${baseType}`)

      if (field.kind === 'scalar') {
        if (field.type === 'String') {
          fields.push(`  ${field.name}_contains: String`)
          fields.push(`  ${field.name}_startsWith: String`)
          fields.push(`  ${field.name}_endsWith: String`)
        }
        if (['Int', 'Float', 'DateTime'].includes(field.type)) {
          fields.push(`  ${field.name}_lt: ${baseType}`)
          fields.push(`  ${field.name}_lte: ${baseType}`)
          fields.push(`  ${field.name}_gt: ${baseType}`)
          fields.push(`  ${field.name}_gte: ${baseType}`)
        }
        fields.push(`  ${field.name}_not: ${baseType}`)
        fields.push(`  ${field.name}_in: [${baseType}!]`)
        fields.push(`  ${field.name}_notIn: [${baseType}!]`)
      }
    })

    fields.push(`  AND: [${model.name}WhereInput!]`)
    fields.push(`  OR: [${model.name}WhereInput!]`)
    fields.push(`  NOT: [${model.name}WhereInput!]`)

    return `input ${model.name}WhereInput {\n${fields.join('\n')}\n}`
  }

  function generateOrderByInput(model: any): string {
    return `input ${model.name}OrderByInput {
  ${model.fields
    .filter((field: any) => field.kind === 'scalar' || field.kind === 'enum')
    .map((field: any) => `${field.name}: SortOrder`)
    .join('\n  ')}
}`
  }

  function generateQueries(models: any[]): string {
    const queries = models.map(model => {
      const name = model.name
      const nameLower = name.charAt(0).toLowerCase() + name.slice(1)
      const namePlural = nameLower + 's'

      return `  ${nameLower}(where: ${name}WhereInput!): ${name}
  ${namePlural}(
    where: ${name}WhereInput
    orderBy: [${name}OrderByInput!]
    skip: Int
    take: Int
  ): [${name}!]!
  ${namePlural}Count(where: ${name}WhereInput): Int!`
    }).join('\n')

    return `type Query {\n${queries}\n}`
  }

  function generateMutations(models: any[]): string {
    const mutations = models.map(model => {
      const name = model.name
      const nameLower = name.charAt(0).toLowerCase() + name.slice(1)

      return `  create${name}(data: ${name}CreateInput!): ${name}!
  update${name}(where: ${name}WhereInput!, data: ${name}UpdateInput!): ${name}!
  delete${name}(where: ${name}WhereInput!): ${name}!
  upsert${name}(
    where: ${name}WhereInput!
    create: ${name}CreateInput!
    update: ${name}UpdateInput!
  ): ${name}!`
    }).join('\n')

    return `type Mutation {\n${mutations}\n}`
  }

  let schema = `scalar DateTime
scalar JSON

enum SortOrder {
  asc
  desc
}

`

  if (dmmf.datamodel.enums && dmmf.datamodel.enums.length > 0) {
    const enums = dmmf.datamodel.enums.map(generateEnumType).join('\n\n')
    schema += enums + '\n\n'
  }

  const models = dmmf.datamodel.models

  const types = models.map(generateModelType).join('\n\n')
  schema += types + '\n\n'

  const inputTypes = models.flatMap(model => [
    generateWhereInput(model),
    generateOrderByInput(model),
    generateInputType(model, 'CreateInput'),
    generateInputType(model, 'UpdateInput')
  ]).join('\n\n')
  schema += inputTypes + '\n\n'

  schema += generateQueries(models) + '\n\n'
  schema += generateMutations(models) + '\n'

  await writeFile('./prisma/schema.gql', schema, 'utf8')

  console.log('GraphQL schema generated successfully at ./prisma/schema.graphql')
  console.log(`Generated ${models.length} types, ${dmmf.datamodel.enums?.length || 0} enums`)

  return schema
}

generateGraphQLSchema().catch(console.error)
