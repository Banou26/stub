/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 */
const documents = {
    "#graphql\n  query GetUserMediaPage($input: UserMediaPageInput!) {\n    userMediaPage(input: $input) {\n      nodes {\n        ...GetUserMediaListFragment\n      }\n    }\n  }\n\n  fragment GetUserMediaListFragment on Media {\n    origin\n    id\n    uri\n    url\n    title {\n      romanized\n      english\n      native\n    }\n    bannerImage\n    coverImage {\n      color\n      default\n      extraLarge\n      large\n      medium\n      small\n    }\n    description\n    shortDescription\n    season\n    seasonYear\n    popularity\n    averageScore\n    episodeCount\n    episodes {\n      edges {\n        node {\n          origin\n          id\n          uri\n          url\n          number\n          airingAt\n          title {\n            romanized\n            english\n            native\n          }\n          description\n          thumbnail\n        }\n      }\n    }\n    trailers {\n      origin\n      id\n      uri\n      url\n      thumbnail\n    }\n    startDate {\n      year\n      month\n      day\n    }\n    endDate {\n      year\n      month\n      day\n    }\n  }\n": types.GetUserMediaPageDocument,
    "\n  subscription GetCurrentSeason($input: MediaPageInput!) {\n    mediaPage(input: $input) {\n      nodes {\n        handles {\n          edges {\n            node {\n              ...GetMediaTestFragment\n            }\n          }\n        }\n        ...GetMediaTestFragment\n      }\n    }\n  }\n\n  fragment GetMediaTestFragment on Media {\n    origin\n    id\n    uri\n    url\n    title {\n      romanized\n      english\n      native\n    }\n    bannerImage\n    coverImage {\n      color\n      default\n      extraLarge\n      large\n      medium\n      small\n    }\n    description\n    shortDescription\n    season\n    seasonYear\n    popularity\n    averageScore\n    episodeCount\n    episodes {\n      edges {\n        node {\n          origin\n          id\n          uri\n          url\n          number\n          airingAt\n          title {\n            romanized\n            english\n            native\n          }\n          description\n          thumbnail\n        }\n      }\n    }\n    trailers {\n      origin\n      id\n      uri\n      url\n      thumbnail\n    }\n    startDate {\n      year\n      month\n      day\n    }\n    endDate {\n      year\n      month\n      day\n    }\n  }\n": types.GetCurrentSeasonDocument,
    "#graphql\n  query GetOrigins($input: OriginPageInput!) {\n    originPage(input: $input) {\n      id\n      name\n      official\n      metadataOnly\n    }\n  }\n": types.GetOriginsDocument,
    "\n  query GetEpisodeTest($input: EpisodePageInput!) {\n    episodePage(input: $input) {\n      nodes {\n        uri\n        handles {\n          edges @stream {\n            node {\n              uri\n              media {\n                uri\n              }\n            }\n          }\n        }\n        media {\n          uri\n          handles {\n            edges {\n              node {\n                uri\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n": types.GetEpisodeTestDocument,
};

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = gql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function gql(source: string): unknown;

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "#graphql\n  query GetUserMediaPage($input: UserMediaPageInput!) {\n    userMediaPage(input: $input) {\n      nodes {\n        ...GetUserMediaListFragment\n      }\n    }\n  }\n\n  fragment GetUserMediaListFragment on Media {\n    origin\n    id\n    uri\n    url\n    title {\n      romanized\n      english\n      native\n    }\n    bannerImage\n    coverImage {\n      color\n      default\n      extraLarge\n      large\n      medium\n      small\n    }\n    description\n    shortDescription\n    season\n    seasonYear\n    popularity\n    averageScore\n    episodeCount\n    episodes {\n      edges {\n        node {\n          origin\n          id\n          uri\n          url\n          number\n          airingAt\n          title {\n            romanized\n            english\n            native\n          }\n          description\n          thumbnail\n        }\n      }\n    }\n    trailers {\n      origin\n      id\n      uri\n      url\n      thumbnail\n    }\n    startDate {\n      year\n      month\n      day\n    }\n    endDate {\n      year\n      month\n      day\n    }\n  }\n"): (typeof documents)["#graphql\n  query GetUserMediaPage($input: UserMediaPageInput!) {\n    userMediaPage(input: $input) {\n      nodes {\n        ...GetUserMediaListFragment\n      }\n    }\n  }\n\n  fragment GetUserMediaListFragment on Media {\n    origin\n    id\n    uri\n    url\n    title {\n      romanized\n      english\n      native\n    }\n    bannerImage\n    coverImage {\n      color\n      default\n      extraLarge\n      large\n      medium\n      small\n    }\n    description\n    shortDescription\n    season\n    seasonYear\n    popularity\n    averageScore\n    episodeCount\n    episodes {\n      edges {\n        node {\n          origin\n          id\n          uri\n          url\n          number\n          airingAt\n          title {\n            romanized\n            english\n            native\n          }\n          description\n          thumbnail\n        }\n      }\n    }\n    trailers {\n      origin\n      id\n      uri\n      url\n      thumbnail\n    }\n    startDate {\n      year\n      month\n      day\n    }\n    endDate {\n      year\n      month\n      day\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  subscription GetCurrentSeason($input: MediaPageInput!) {\n    mediaPage(input: $input) {\n      nodes {\n        handles {\n          edges {\n            node {\n              ...GetMediaTestFragment\n            }\n          }\n        }\n        ...GetMediaTestFragment\n      }\n    }\n  }\n\n  fragment GetMediaTestFragment on Media {\n    origin\n    id\n    uri\n    url\n    title {\n      romanized\n      english\n      native\n    }\n    bannerImage\n    coverImage {\n      color\n      default\n      extraLarge\n      large\n      medium\n      small\n    }\n    description\n    shortDescription\n    season\n    seasonYear\n    popularity\n    averageScore\n    episodeCount\n    episodes {\n      edges {\n        node {\n          origin\n          id\n          uri\n          url\n          number\n          airingAt\n          title {\n            romanized\n            english\n            native\n          }\n          description\n          thumbnail\n        }\n      }\n    }\n    trailers {\n      origin\n      id\n      uri\n      url\n      thumbnail\n    }\n    startDate {\n      year\n      month\n      day\n    }\n    endDate {\n      year\n      month\n      day\n    }\n  }\n"): (typeof documents)["\n  subscription GetCurrentSeason($input: MediaPageInput!) {\n    mediaPage(input: $input) {\n      nodes {\n        handles {\n          edges {\n            node {\n              ...GetMediaTestFragment\n            }\n          }\n        }\n        ...GetMediaTestFragment\n      }\n    }\n  }\n\n  fragment GetMediaTestFragment on Media {\n    origin\n    id\n    uri\n    url\n    title {\n      romanized\n      english\n      native\n    }\n    bannerImage\n    coverImage {\n      color\n      default\n      extraLarge\n      large\n      medium\n      small\n    }\n    description\n    shortDescription\n    season\n    seasonYear\n    popularity\n    averageScore\n    episodeCount\n    episodes {\n      edges {\n        node {\n          origin\n          id\n          uri\n          url\n          number\n          airingAt\n          title {\n            romanized\n            english\n            native\n          }\n          description\n          thumbnail\n        }\n      }\n    }\n    trailers {\n      origin\n      id\n      uri\n      url\n      thumbnail\n    }\n    startDate {\n      year\n      month\n      day\n    }\n    endDate {\n      year\n      month\n      day\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "#graphql\n  query GetOrigins($input: OriginPageInput!) {\n    originPage(input: $input) {\n      id\n      name\n      official\n      metadataOnly\n    }\n  }\n"): (typeof documents)["#graphql\n  query GetOrigins($input: OriginPageInput!) {\n    originPage(input: $input) {\n      id\n      name\n      official\n      metadataOnly\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query GetEpisodeTest($input: EpisodePageInput!) {\n    episodePage(input: $input) {\n      nodes {\n        uri\n        handles {\n          edges @stream {\n            node {\n              uri\n              media {\n                uri\n              }\n            }\n          }\n        }\n        media {\n          uri\n          handles {\n            edges {\n              node {\n                uri\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetEpisodeTest($input: EpisodePageInput!) {\n    episodePage(input: $input) {\n      nodes {\n        uri\n        handles {\n          edges @stream {\n            node {\n              uri\n              media {\n                uri\n              }\n            }\n          }\n        }\n        media {\n          uri\n          handles {\n            edges {\n              node {\n                uri\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n"];

export function gql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;