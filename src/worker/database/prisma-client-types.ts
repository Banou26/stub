/**
 * Complete type definitions for the patched Prisma Client
 * These types ensure the proxy client behaves exactly like the normal PrismaClient type-wise
 */

import type { PrismaClient as OriginalPrismaClient, Prisma } from '@prisma/client'

// Re-export Prisma namespace for convenience
export { Prisma } from '@prisma/client'

// Model types from the schema
export interface Media {
  id: string
  name: string
  handles?: Media[]
  handledBy?: Media[]
}

// Input types for operations
export interface MediaCreateInput {
  id: string
  name: string
  handles?: MediaCreateNestedManyWithoutHandledByInput
  handledBy?: MediaCreateNestedManyWithoutHandlesInput
}

export interface MediaUpdateInput {
  id?: string
  name?: string
  handles?: MediaUpdateManyWithoutHandledByNestedInput
  handledBy?: MediaUpdateManyWithoutHandlesNestedInput
}

// Nested input types for implicit many-to-many
export interface MediaCreateNestedManyWithoutHandledByInput {
  create?: MediaCreateWithoutHandledByInput | MediaCreateWithoutHandledByInput[]
  connectOrCreate?: MediaCreateOrConnectWithoutHandledByInput | MediaCreateOrConnectWithoutHandledByInput[]
  connect?: MediaWhereUniqueInput | MediaWhereUniqueInput[]
}

export interface MediaCreateNestedManyWithoutHandlesInput {
  create?: MediaCreateWithoutHandlesInput | MediaCreateWithoutHandlesInput[]
  connectOrCreate?: MediaCreateOrConnectWithoutHandlesInput | MediaCreateOrConnectWithoutHandlesInput[]
  connect?: MediaWhereUniqueInput | MediaWhereUniqueInput[]
}

export interface MediaUpdateManyWithoutHandledByNestedInput {
  create?: MediaCreateWithoutHandledByInput | MediaCreateWithoutHandledByInput[]
  connectOrCreate?: MediaCreateOrConnectWithoutHandledByInput | MediaCreateOrConnectWithoutHandledByInput[]
  upsert?: MediaUpsertWithWhereUniqueWithoutHandledByInput | MediaUpsertWithWhereUniqueWithoutHandledByInput[]
  set?: MediaWhereUniqueInput | MediaWhereUniqueInput[]
  disconnect?: MediaWhereUniqueInput | MediaWhereUniqueInput[]
  delete?: MediaWhereUniqueInput | MediaWhereUniqueInput[]
  connect?: MediaWhereUniqueInput | MediaWhereUniqueInput[]
  update?: MediaUpdateWithWhereUniqueWithoutHandledByInput | MediaUpdateWithWhereUniqueWithoutHandledByInput[]
  updateMany?: MediaUpdateManyWithWhereWithoutHandledByInput | MediaUpdateManyWithWhereWithoutHandledByInput[]
  deleteMany?: MediaScalarWhereInput | MediaScalarWhereInput[]
}

export interface MediaUpdateManyWithoutHandlesNestedInput {
  create?: MediaCreateWithoutHandlesInput | MediaCreateWithoutHandlesInput[]
  connectOrCreate?: MediaCreateOrConnectWithoutHandlesInput | MediaCreateOrConnectWithoutHandlesInput[]
  upsert?: MediaUpsertWithWhereUniqueWithoutHandlesInput | MediaUpsertWithWhereUniqueWithoutHandlesInput[]
  set?: MediaWhereUniqueInput | MediaWhereUniqueInput[]
  disconnect?: MediaWhereUniqueInput | MediaWhereUniqueInput[]
  delete?: MediaWhereUniqueInput | MediaWhereUniqueInput[]
  connect?: MediaWhereUniqueInput | MediaWhereUniqueInput[]
  update?: MediaUpdateWithWhereUniqueWithoutHandlesInput | MediaUpdateWithWhereUniqueWithoutHandlesInput[]
  updateMany?: MediaUpdateManyWithWhereWithoutHandlesInput | MediaUpdateManyWithWhereWithoutHandlesInput[]
  deleteMany?: MediaScalarWhereInput | MediaScalarWhereInput[]
}

// Where input types
export interface MediaWhereInput {
  AND?: MediaWhereInput | MediaWhereInput[]
  OR?: MediaWhereInput | MediaWhereInput[]
  NOT?: MediaWhereInput | MediaWhereInput[]
  id?: StringFilter | string
  name?: StringFilter | string
  handles?: MediaListRelationFilter
  handledBy?: MediaListRelationFilter
}

export interface MediaWhereUniqueInput {
  id?: string
  AND?: MediaWhereInput | MediaWhereInput[]
  OR?: MediaWhereInput | MediaWhereInput[]
  NOT?: MediaWhereInput | MediaWhereInput[]
  name?: StringFilter | string
  handles?: MediaListRelationFilter
  handledBy?: MediaListRelationFilter
}

// Filter types
export interface StringFilter {
  equals?: string
  in?: string[]
  notIn?: string[]
  lt?: string
  lte?: string
  gt?: string
  gte?: string
  contains?: string
  startsWith?: string
  endsWith?: string
  not?: NestedStringFilter | string
}

export interface NestedStringFilter {
  equals?: string
  in?: string[]
  notIn?: string[]
  lt?: string
  lte?: string
  gt?: string
  gte?: string
  contains?: string
  startsWith?: string
  endsWith?: string
  not?: NestedStringFilter | string
}

export interface MediaListRelationFilter {
  every?: MediaWhereInput
  some?: MediaWhereInput
  none?: MediaWhereInput
}

export interface MediaRelationFilter {
  is?: MediaWhereInput
  isNot?: MediaWhereInput
}

// Create without relation input types
export interface MediaCreateWithoutHandlesInput {
  id: string
  name: string
  handledBy?: MediaCreateNestedManyWithoutHandlesInput
}

export interface MediaCreateWithoutHandledByInput {
  id: string
  name: string
  handles?: MediaCreateNestedManyWithoutHandledByInput
}

// Update types
export interface MediaUpdateWithoutHandlesInput {
  id?: string
  name?: string
  handledBy?: MediaUpdateManyWithoutHandlesNestedInput
}

export interface MediaUpdateWithoutHandledByInput {
  id?: string
  name?: string
  handles?: MediaUpdateManyWithoutHandledByNestedInput
}

export interface MediaUpdateWithWhereUniqueWithoutHandlesInput {
  where: MediaWhereUniqueInput
  data: MediaUpdateWithoutHandlesInput
}

export interface MediaUpdateWithWhereUniqueWithoutHandledByInput {
  where: MediaWhereUniqueInput
  data: MediaUpdateWithoutHandledByInput
}

export interface MediaUpdateManyWithWhereWithoutHandlesInput {
  where: MediaScalarWhereInput
  data: MediaUpdateManyMutationInput
}

export interface MediaUpdateManyWithWhereWithoutHandledByInput {
  where: MediaScalarWhereInput
  data: MediaUpdateManyMutationInput
}

export interface MediaUpdateManyMutationInput {
  id?: string
  name?: string
}

export interface MediaScalarWhereInput {
  AND?: MediaScalarWhereInput | MediaScalarWhereInput[]
  OR?: MediaScalarWhereInput | MediaScalarWhereInput[]
  NOT?: MediaScalarWhereInput | MediaScalarWhereInput[]
  id?: StringFilter | string
  name?: StringFilter | string
}

// Create or connect types
export interface MediaCreateOrConnectWithoutHandlesInput {
  where: MediaWhereUniqueInput
  create: MediaCreateWithoutHandlesInput
}

export interface MediaCreateOrConnectWithoutHandledByInput {
  where: MediaWhereUniqueInput
  create: MediaCreateWithoutHandledByInput
}

// Upsert types
export interface MediaUpsertWithoutHandlesInput {
  update: MediaUpdateWithoutHandlesInput
  create: MediaCreateWithoutHandlesInput
  where?: MediaWhereInput
}

export interface MediaUpsertWithoutHandledByInput {
  update: MediaUpdateWithoutHandledByInput
  create: MediaCreateWithoutHandledByInput
  where?: MediaWhereInput
}

export interface MediaUpsertWithWhereUniqueWithoutHandlesInput {
  where: MediaWhereUniqueInput
  update: MediaUpdateWithoutHandlesInput
  create: MediaCreateWithoutHandlesInput
}

export interface MediaUpsertWithWhereUniqueWithoutHandledByInput {
  where: MediaWhereUniqueInput
  update: MediaUpdateWithoutHandledByInput
  create: MediaCreateWithoutHandledByInput
}

// Order by types
export interface MediaOrderByWithRelationInput {
  id?: SortOrder
  name?: SortOrder
  handles?: MediaOrderByRelationAggregateInput
  handledBy?: MediaOrderByRelationAggregateInput
}

export interface MediaOrderByRelationAggregateInput {
  _count?: SortOrder
}

export type SortOrder = 'asc' | 'desc'

// Select and Include types
export interface MediaSelect {
  id?: boolean
  name?: boolean
  handles?: boolean | MediaFindManyArgs
  handledBy?: boolean | MediaFindManyArgs
  _count?: boolean | MediaCountOutputTypeArgs
}

export interface MediaInclude {
  handles?: boolean | MediaFindManyArgs
  handledBy?: boolean | MediaFindManyArgs
  _count?: boolean | MediaCountOutputTypeArgs
}

export interface MediaCountOutputTypeArgs {
  select?: MediaCountOutputTypeSelect
}

export interface MediaCountOutputTypeSelect {
  handles?: boolean
  handledBy?: boolean
}

// Delegate argument types
export interface MediaFindFirstArgs {
  select?: MediaSelect
  include?: MediaInclude
  where?: MediaWhereInput
  orderBy?: MediaOrderByWithRelationInput | MediaOrderByWithRelationInput[]
  cursor?: MediaWhereUniqueInput
  take?: number
  skip?: number
  distinct?: Array<keyof Media>
}

export interface MediaFindFirstOrThrowArgs extends MediaFindFirstArgs {}

export interface MediaFindManyArgs {
  select?: MediaSelect
  include?: MediaInclude
  where?: MediaWhereInput
  orderBy?: MediaOrderByWithRelationInput | MediaOrderByWithRelationInput[]
  cursor?: MediaWhereUniqueInput
  take?: number
  skip?: number
  distinct?: Array<keyof Media>
}

export interface MediaFindUniqueArgs {
  select?: MediaSelect
  include?: MediaInclude
  where: MediaWhereUniqueInput
}

export interface MediaFindUniqueOrThrowArgs extends MediaFindUniqueArgs {}

export interface MediaCreateArgs {
  select?: MediaSelect
  include?: MediaInclude
  data: MediaCreateInput
}

export interface MediaCreateManyArgs {
  data: MediaCreateInput | MediaCreateInput[]
  skipDuplicates?: boolean
}

export interface MediaUpdateArgs {
  select?: MediaSelect
  include?: MediaInclude
  data: MediaUpdateInput
  where: MediaWhereUniqueInput
}

export interface MediaUpdateManyArgs {
  data: MediaUpdateInput
  where?: MediaWhereInput
}

export interface MediaUpsertArgs {
  select?: MediaSelect
  include?: MediaInclude
  where: MediaWhereUniqueInput
  create: MediaCreateInput
  update: MediaUpdateInput
}

export interface MediaDeleteArgs {
  select?: MediaSelect
  include?: MediaInclude
  where: MediaWhereUniqueInput
}

export interface MediaDeleteManyArgs {
  where?: MediaWhereInput
}

export interface MediaCountArgs {
  where?: MediaWhereInput
  cursor?: MediaWhereUniqueInput
  take?: number
  skip?: number
  distinct?: Array<keyof Media>
}

export interface MediaAggregateArgs {
  where?: MediaWhereInput
  orderBy?: MediaOrderByWithRelationInput | MediaOrderByWithRelationInput[]
  cursor?: MediaWhereUniqueInput
  take?: number
  skip?: number
  _count?: true | MediaCountAggregateInputType
  _min?: MediaMinAggregateInputType
  _max?: MediaMaxAggregateInputType
}

export interface MediaGroupByArgs {
  where?: MediaWhereInput
  orderBy?: MediaOrderByWithAggregationInput | MediaOrderByWithAggregationInput[]
  by: Array<keyof Media>
  having?: MediaScalarWhereWithAggregatesInput
  take?: number
  skip?: number
  _count?: true | MediaCountAggregateInputType
  _min?: MediaMinAggregateInputType
  _max?: MediaMaxAggregateInputType
}

export interface MediaCountAggregateInputType {
  id?: true
  name?: true
  _all?: true
}

export interface MediaMinAggregateInputType {
  id?: true
  name?: true
}

export interface MediaMaxAggregateInputType {
  id?: true
  name?: true
}

export interface MediaOrderByWithAggregationInput {
  id?: SortOrder
  name?: SortOrder
  _count?: MediaCountOrderByAggregateInput
  _max?: MediaMaxOrderByAggregateInput
  _min?: MediaMinOrderByAggregateInput
}

export interface MediaCountOrderByAggregateInput {
  id?: SortOrder
  name?: SortOrder
}

export interface MediaMaxOrderByAggregateInput {
  id?: SortOrder
  name?: SortOrder
}

export interface MediaMinOrderByAggregateInput {
  id?: SortOrder
  name?: SortOrder
}

export interface MediaScalarWhereWithAggregatesInput {
  AND?: MediaScalarWhereWithAggregatesInput | MediaScalarWhereWithAggregatesInput[]
  OR?: MediaScalarWhereWithAggregatesInput | MediaScalarWhereWithAggregatesInput[]
  NOT?: MediaScalarWhereWithAggregatesInput | MediaScalarWhereWithAggregatesInput[]
  id?: StringWithAggregatesFilter | string
  name?: StringWithAggregatesFilter | string
}

export interface StringWithAggregatesFilter extends StringFilter {
  _count?: NestedIntFilter
  _min?: NestedStringFilter
  _max?: NestedStringFilter
}

export interface NestedIntFilter {
  equals?: number
  in?: number[]
  notIn?: number[]
  lt?: number
  lte?: number
  gt?: number
  gte?: number
  not?: NestedIntFilter | number
}


// Batch payload type
export interface BatchPayload {
  count: number
}

// Transaction types
export type TransactionClient = Omit<PatchedPrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export interface TransactionOptions {
  maxWait?: number
  timeout?: number
  isolationLevel?: Prisma.TransactionIsolationLevel
}

// Delegate types
export interface MediaDelegate {
  findFirst<T extends MediaFindFirstArgs>(args?: T): Promise<Media | null>
  findFirstOrThrow<T extends MediaFindFirstOrThrowArgs>(args?: T): Promise<Media>
  findMany<T extends MediaFindManyArgs>(args?: T): Promise<Media[]>
  findUnique<T extends MediaFindUniqueArgs>(args: T): Promise<Media | null>
  findUniqueOrThrow<T extends MediaFindUniqueOrThrowArgs>(args: T): Promise<Media>
  create<T extends MediaCreateArgs>(args: T): Promise<Media>
  createMany<T extends MediaCreateManyArgs>(args: T): Promise<BatchPayload>
  update<T extends MediaUpdateArgs>(args: T): Promise<Media>
  updateMany<T extends MediaUpdateManyArgs>(args: T): Promise<BatchPayload>
  upsert<T extends MediaUpsertArgs>(args: T): Promise<Media>
  delete<T extends MediaDeleteArgs>(args: T): Promise<Media>
  deleteMany<T extends MediaDeleteManyArgs>(args?: T): Promise<BatchPayload>
  count<T extends MediaCountArgs>(args?: T): Promise<number>
  aggregate<T extends MediaAggregateArgs>(args: T): Promise<any>
  groupBy<T extends MediaGroupByArgs>(args: T): Promise<any[]>
}


// Main PrismaClient interface
export interface PatchedPrismaClient {
  // Connection methods
  $connect(): Promise<void>
  $disconnect(): Promise<void>
  
  // Raw query methods
  $executeRaw(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Promise<number>
  $executeRawUnsafe(query: string, ...values: any[]): Promise<number>
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Promise<T>
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Promise<T>
  
  // Transaction methods
  $transaction<P extends Promise<any>[]>(arg: [...P]): Promise<UnwrapTuple<P>>
  $transaction<R>(fn: (prisma: TransactionClient) => Promise<R>, options?: TransactionOptions): Promise<R>
  
  // Model delegates
  media: MediaDelegate
}

// Utility type to unwrap tuple of promises
type UnwrapTuple<T extends readonly unknown[]> = {
  [K in keyof T]: T[K] extends Promise<infer U> ? U : T[K]
}

// Type guard functions
export function isMedia(obj: any): obj is Media {
  return obj && typeof obj === 'object' && 'id' in obj && 'name' in obj
}

// Export the main client type
export type { PatchedPrismaClient as PrismaClient }