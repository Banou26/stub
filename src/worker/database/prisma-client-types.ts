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
}

export interface MediaHandle {
  mediaId: string
  handlesId: string
}

// Input types for operations
export interface MediaCreateInput {
  id: string
  name: string
  handles?: MediaHandleCreateNestedManyWithoutHandlerInput
  handledBy?: MediaHandleCreateNestedManyWithoutHandledInput
}

export interface MediaUpdateInput {
  id?: string
  name?: string
  handles?: MediaHandleUpdateManyWithoutHandlerNestedInput
  handledBy?: MediaHandleUpdateManyWithoutHandledNestedInput
}

export interface MediaHandleCreateInput {
  mediaId: string
  handlesId: string
  handler?: MediaCreateNestedOneWithoutHandlesInput
  handled?: MediaCreateNestedOneWithoutHandledByInput
}

export interface MediaHandleUpdateInput {
  mediaId?: string
  handlesId?: string
  handler?: MediaUpdateOneRequiredWithoutHandlesNestedInput
  handled?: MediaUpdateOneRequiredWithoutHandledByNestedInput
}

// Nested input types
export interface MediaHandleCreateNestedManyWithoutHandlerInput {
  create?: MediaHandleCreateWithoutHandlerInput | MediaHandleCreateWithoutHandlerInput[]
  connectOrCreate?: MediaHandleCreateOrConnectWithoutHandlerInput | MediaHandleCreateOrConnectWithoutHandlerInput[]
  connect?: MediaHandleWhereUniqueInput | MediaHandleWhereUniqueInput[]
}

export interface MediaHandleCreateNestedManyWithoutHandledInput {
  create?: MediaHandleCreateWithoutHandledInput | MediaHandleCreateWithoutHandledInput[]
  connectOrCreate?: MediaHandleCreateOrConnectWithoutHandledInput | MediaHandleCreateOrConnectWithoutHandledInput[]
  connect?: MediaHandleWhereUniqueInput | MediaHandleWhereUniqueInput[]
}

export interface MediaHandleUpdateManyWithoutHandlerNestedInput {
  create?: MediaHandleCreateWithoutHandlerInput | MediaHandleCreateWithoutHandlerInput[]
  connectOrCreate?: MediaHandleCreateOrConnectWithoutHandlerInput | MediaHandleCreateOrConnectWithoutHandlerInput[]
  upsert?: MediaHandleUpsertWithWhereUniqueWithoutHandlerInput | MediaHandleUpsertWithWhereUniqueWithoutHandlerInput[]
  set?: MediaHandleWhereUniqueInput | MediaHandleWhereUniqueInput[]
  disconnect?: MediaHandleWhereUniqueInput | MediaHandleWhereUniqueInput[]
  delete?: MediaHandleWhereUniqueInput | MediaHandleWhereUniqueInput[]
  connect?: MediaHandleWhereUniqueInput | MediaHandleWhereUniqueInput[]
  update?: MediaHandleUpdateWithWhereUniqueWithoutHandlerInput | MediaHandleUpdateWithWhereUniqueWithoutHandlerInput[]
  updateMany?: MediaHandleUpdateManyWithWhereWithoutHandlerInput | MediaHandleUpdateManyWithWhereWithoutHandlerInput[]
  deleteMany?: MediaHandleScalarWhereInput | MediaHandleScalarWhereInput[]
}

export interface MediaHandleUpdateManyWithoutHandledNestedInput {
  create?: MediaHandleCreateWithoutHandledInput | MediaHandleCreateWithoutHandledInput[]
  connectOrCreate?: MediaHandleCreateOrConnectWithoutHandledInput | MediaHandleCreateOrConnectWithoutHandledInput[]
  upsert?: MediaHandleUpsertWithWhereUniqueWithoutHandledInput | MediaHandleUpsertWithWhereUniqueWithoutHandledInput[]
  set?: MediaHandleWhereUniqueInput | MediaHandleWhereUniqueInput[]
  disconnect?: MediaHandleWhereUniqueInput | MediaHandleWhereUniqueInput[]
  delete?: MediaHandleWhereUniqueInput | MediaHandleWhereUniqueInput[]
  connect?: MediaHandleWhereUniqueInput | MediaHandleWhereUniqueInput[]
  update?: MediaHandleUpdateWithWhereUniqueWithoutHandledInput | MediaHandleUpdateWithWhereUniqueWithoutHandledInput[]
  updateMany?: MediaHandleUpdateManyWithWhereWithoutHandledInput | MediaHandleUpdateManyWithWhereWithoutHandledInput[]
  deleteMany?: MediaHandleScalarWhereInput | MediaHandleScalarWhereInput[]
}

export interface MediaCreateNestedOneWithoutHandlesInput {
  create?: MediaCreateWithoutHandlesInput
  connectOrCreate?: MediaCreateOrConnectWithoutHandlesInput
  connect?: MediaWhereUniqueInput
}

export interface MediaCreateNestedOneWithoutHandledByInput {
  create?: MediaCreateWithoutHandledByInput
  connectOrCreate?: MediaCreateOrConnectWithoutHandledByInput
  connect?: MediaWhereUniqueInput
}

export interface MediaUpdateOneRequiredWithoutHandlesNestedInput {
  create?: MediaCreateWithoutHandlesInput
  connectOrCreate?: MediaCreateOrConnectWithoutHandlesInput
  upsert?: MediaUpsertWithoutHandlesInput
  connect?: MediaWhereUniqueInput
  update?: MediaUpdateWithoutHandlesInput
}

export interface MediaUpdateOneRequiredWithoutHandledByNestedInput {
  create?: MediaCreateWithoutHandledByInput
  connectOrCreate?: MediaCreateOrConnectWithoutHandledByInput
  upsert?: MediaUpsertWithoutHandledByInput
  connect?: MediaWhereUniqueInput
  update?: MediaUpdateWithoutHandledByInput
}

// Where input types
export interface MediaWhereInput {
  AND?: MediaWhereInput | MediaWhereInput[]
  OR?: MediaWhereInput | MediaWhereInput[]
  NOT?: MediaWhereInput | MediaWhereInput[]
  id?: StringFilter | string
  name?: StringFilter | string
  handles?: MediaHandleListRelationFilter
  handledBy?: MediaHandleListRelationFilter
}

export interface MediaHandleWhereInput {
  AND?: MediaHandleWhereInput | MediaHandleWhereInput[]
  OR?: MediaHandleWhereInput | MediaHandleWhereInput[]
  NOT?: MediaHandleWhereInput | MediaHandleWhereInput[]
  mediaId?: StringFilter | string
  handlesId?: StringFilter | string
  handler?: MediaRelationFilter | MediaWhereInput
  handled?: MediaRelationFilter | MediaWhereInput
}

export interface MediaWhereUniqueInput {
  id?: string
  AND?: MediaWhereInput | MediaWhereInput[]
  OR?: MediaWhereInput | MediaWhereInput[]
  NOT?: MediaWhereInput | MediaWhereInput[]
  name?: StringFilter | string
  handles?: MediaHandleListRelationFilter
  handledBy?: MediaHandleListRelationFilter
}

export interface MediaHandleWhereUniqueInput {
  mediaId_handlesId?: {
    mediaId: string
    handlesId: string
  }
  AND?: MediaHandleWhereInput | MediaHandleWhereInput[]
  OR?: MediaHandleWhereInput | MediaHandleWhereInput[]
  NOT?: MediaHandleWhereInput | MediaHandleWhereInput[]
  mediaId?: StringFilter | string
  handlesId?: StringFilter | string
  handler?: MediaRelationFilter | MediaWhereInput
  handled?: MediaRelationFilter | MediaWhereInput
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

export interface MediaHandleListRelationFilter {
  every?: MediaHandleWhereInput
  some?: MediaHandleWhereInput
  none?: MediaHandleWhereInput
}

export interface MediaRelationFilter {
  is?: MediaWhereInput
  isNot?: MediaWhereInput
}

// Create without relation input types
export interface MediaCreateWithoutHandlesInput {
  id: string
  name: string
  handledBy?: MediaHandleCreateNestedManyWithoutHandledInput
}

export interface MediaCreateWithoutHandledByInput {
  id: string
  name: string
  handles?: MediaHandleCreateNestedManyWithoutHandlerInput
}

export interface MediaHandleCreateWithoutHandlerInput {
  handlesId: string
  handled?: MediaCreateNestedOneWithoutHandledByInput
}

export interface MediaHandleCreateWithoutHandledInput {
  mediaId: string
  handler?: MediaCreateNestedOneWithoutHandlesInput
}

// Update types
export interface MediaUpdateWithoutHandlesInput {
  id?: string
  name?: string
  handledBy?: MediaHandleUpdateManyWithoutHandledNestedInput
}

export interface MediaUpdateWithoutHandledByInput {
  id?: string
  name?: string
  handles?: MediaHandleUpdateManyWithoutHandlerNestedInput
}

export interface MediaHandleUpdateWithWhereUniqueWithoutHandlerInput {
  where: MediaHandleWhereUniqueInput
  data: MediaHandleUpdateWithoutHandlerInput
}

export interface MediaHandleUpdateWithWhereUniqueWithoutHandledInput {
  where: MediaHandleWhereUniqueInput
  data: MediaHandleUpdateWithoutHandledInput
}

export interface MediaHandleUpdateWithoutHandlerInput {
  handlesId?: string
  handled?: MediaUpdateOneRequiredWithoutHandledByNestedInput
}

export interface MediaHandleUpdateWithoutHandledInput {
  mediaId?: string
  handler?: MediaUpdateOneRequiredWithoutHandlesNestedInput
}

export interface MediaHandleUpdateManyWithWhereWithoutHandlerInput {
  where: MediaHandleScalarWhereInput
  data: MediaHandleUpdateManyMutationInput
}

export interface MediaHandleUpdateManyWithWhereWithoutHandledInput {
  where: MediaHandleScalarWhereInput
  data: MediaHandleUpdateManyMutationInput
}

export interface MediaHandleUpdateManyMutationInput {
  mediaId?: string
  handlesId?: string
}

export interface MediaHandleScalarWhereInput {
  AND?: MediaHandleScalarWhereInput | MediaHandleScalarWhereInput[]
  OR?: MediaHandleScalarWhereInput | MediaHandleScalarWhereInput[]
  NOT?: MediaHandleScalarWhereInput | MediaHandleScalarWhereInput[]
  mediaId?: StringFilter | string
  handlesId?: StringFilter | string
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

export interface MediaHandleCreateOrConnectWithoutHandlerInput {
  where: MediaHandleWhereUniqueInput
  create: MediaHandleCreateWithoutHandlerInput
}

export interface MediaHandleCreateOrConnectWithoutHandledInput {
  where: MediaHandleWhereUniqueInput
  create: MediaHandleCreateWithoutHandledInput
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

export interface MediaHandleUpsertWithWhereUniqueWithoutHandlerInput {
  where: MediaHandleWhereUniqueInput
  update: MediaHandleUpdateWithoutHandlerInput
  create: MediaHandleCreateWithoutHandlerInput
}

export interface MediaHandleUpsertWithWhereUniqueWithoutHandledInput {
  where: MediaHandleWhereUniqueInput
  update: MediaHandleUpdateWithoutHandledInput
  create: MediaHandleCreateWithoutHandledInput
}

// Order by types
export interface MediaOrderByWithRelationInput {
  id?: SortOrder
  name?: SortOrder
  handles?: MediaHandleOrderByRelationAggregateInput
  handledBy?: MediaHandleOrderByRelationAggregateInput
}

export interface MediaHandleOrderByWithRelationInput {
  mediaId?: SortOrder
  handlesId?: SortOrder
  handler?: MediaOrderByWithRelationInput
  handled?: MediaOrderByWithRelationInput
}

export interface MediaHandleOrderByRelationAggregateInput {
  _count?: SortOrder
}

export type SortOrder = 'asc' | 'desc'

// Select and Include types
export interface MediaSelect {
  id?: boolean
  name?: boolean
  handles?: boolean | MediaHandleFindManyArgs
  handledBy?: boolean | MediaHandleFindManyArgs
  _count?: boolean | MediaCountOutputTypeArgs
}

export interface MediaInclude {
  handles?: boolean | MediaHandleFindManyArgs
  handledBy?: boolean | MediaHandleFindManyArgs
  _count?: boolean | MediaCountOutputTypeArgs
}

export interface MediaHandleSelect {
  mediaId?: boolean
  handlesId?: boolean
  handler?: boolean | MediaFindUniqueArgs
  handled?: boolean | MediaFindUniqueArgs
}

export interface MediaHandleInclude {
  handler?: boolean | MediaFindUniqueArgs
  handled?: boolean | MediaFindUniqueArgs
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

// MediaHandle args types
export interface MediaHandleFindFirstArgs {
  select?: MediaHandleSelect
  include?: MediaHandleInclude
  where?: MediaHandleWhereInput
  orderBy?: MediaHandleOrderByWithRelationInput | MediaHandleOrderByWithRelationInput[]
  cursor?: MediaHandleWhereUniqueInput
  take?: number
  skip?: number
  distinct?: Array<keyof MediaHandle>
}

export interface MediaHandleFindFirstOrThrowArgs extends MediaHandleFindFirstArgs {}

export interface MediaHandleFindManyArgs {
  select?: MediaHandleSelect
  include?: MediaHandleInclude
  where?: MediaHandleWhereInput
  orderBy?: MediaHandleOrderByWithRelationInput | MediaHandleOrderByWithRelationInput[]
  cursor?: MediaHandleWhereUniqueInput
  take?: number
  skip?: number
  distinct?: Array<keyof MediaHandle>
}

export interface MediaHandleFindUniqueArgs {
  select?: MediaHandleSelect
  include?: MediaHandleInclude
  where: MediaHandleWhereUniqueInput
}

export interface MediaHandleFindUniqueOrThrowArgs extends MediaHandleFindUniqueArgs {}

export interface MediaHandleCreateArgs {
  select?: MediaHandleSelect
  include?: MediaHandleInclude
  data: MediaHandleCreateInput
}

export interface MediaHandleCreateManyArgs {
  data: MediaHandleCreateInput | MediaHandleCreateInput[]
  skipDuplicates?: boolean
}

export interface MediaHandleUpdateArgs {
  select?: MediaHandleSelect
  include?: MediaHandleInclude
  data: MediaHandleUpdateInput
  where: MediaHandleWhereUniqueInput
}

export interface MediaHandleUpdateManyArgs {
  data: MediaHandleUpdateInput
  where?: MediaHandleWhereInput
}

export interface MediaHandleUpsertArgs {
  select?: MediaHandleSelect
  include?: MediaHandleInclude
  where: MediaHandleWhereUniqueInput
  create: MediaHandleCreateInput
  update: MediaHandleUpdateInput
}

export interface MediaHandleDeleteArgs {
  select?: MediaHandleSelect
  include?: MediaHandleInclude
  where: MediaHandleWhereUniqueInput
}

export interface MediaHandleDeleteManyArgs {
  where?: MediaHandleWhereInput
}

export interface MediaHandleCountArgs {
  where?: MediaHandleWhereInput
  cursor?: MediaHandleWhereUniqueInput
  take?: number
  skip?: number
  distinct?: Array<keyof MediaHandle>
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

export interface MediaHandleDelegate {
  findFirst<T extends MediaHandleFindFirstArgs>(args?: T): Promise<MediaHandle | null>
  findFirstOrThrow<T extends MediaHandleFindFirstOrThrowArgs>(args?: T): Promise<MediaHandle>
  findMany<T extends MediaHandleFindManyArgs>(args?: T): Promise<MediaHandle[]>
  findUnique<T extends MediaHandleFindUniqueArgs>(args: T): Promise<MediaHandle | null>
  findUniqueOrThrow<T extends MediaHandleFindUniqueOrThrowArgs>(args: T): Promise<MediaHandle>
  create<T extends MediaHandleCreateArgs>(args: T): Promise<MediaHandle>
  createMany<T extends MediaHandleCreateManyArgs>(args: T): Promise<BatchPayload>
  update<T extends MediaHandleUpdateArgs>(args: T): Promise<MediaHandle>
  updateMany<T extends MediaHandleUpdateManyArgs>(args: T): Promise<BatchPayload>
  upsert<T extends MediaHandleUpsertArgs>(args: T): Promise<MediaHandle>
  delete<T extends MediaHandleDeleteArgs>(args: T): Promise<MediaHandle>
  deleteMany<T extends MediaHandleDeleteManyArgs>(args?: T): Promise<BatchPayload>
  count<T extends MediaHandleCountArgs>(args?: T): Promise<number>
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
  mediaHandle: MediaHandleDelegate
}

// Utility type to unwrap tuple of promises
type UnwrapTuple<T extends readonly unknown[]> = {
  [K in keyof T]: T[K] extends Promise<infer U> ? U : T[K]
}

// Type guard functions
export function isMedia(obj: any): obj is Media {
  return obj && typeof obj === 'object' && 'id' in obj && 'name' in obj
}

export function isMediaHandle(obj: any): obj is MediaHandle {
  return obj && typeof obj === 'object' && 'mediaId' in obj && 'handlesId' in obj
}

// Export the main client type
export type { PatchedPrismaClient as PrismaClient }