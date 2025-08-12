import { readFile, writeFile } from 'fs/promises'
import internals from '@prisma/internals'

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
      const comment = v.documentation ? `  """${v.documentation}"""\n  ` : '  '
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
      type = `[${type}!]!`
    }

    if (field.isRequired && field.kind !== 'object') {
      type = `${type}!`
    }

    return type
  }

  function generateModelType(model: any): string {
    const fields = model.fields.map((field: any) => {
      const documentation = field.documentation ? `  """${field.documentation}"""\n  ` : '  '
      const fieldType = generateFieldType(field, model)
      return `${documentation}${field.name}: ${fieldType}`
    }).join('\n')

    return `type ${model.name} {\n${fields}\n}`
  }

  let schema = `scalar JSON\n\n`

  if (dmmf.datamodel.enums && dmmf.datamodel.enums.length > 0) {
    const enums = dmmf.datamodel.enums.map(generateEnumType).join('\n\n')
    schema += enums + '\n\n'
  }

  const models = dmmf.datamodel.models

  const types = models.map(generateModelType).join('\n\n')
  schema += types + '\n\n'

  await writeFile('./prisma/schema.gql', schema, 'utf8')

  console.log('GraphQL schema generated successfully at ./prisma/schema.graphql')
  console.log(`Generated ${models.length} types, ${dmmf.datamodel.enums?.length || 0} enums`)

  return schema
}

generateGraphQLSchema()
