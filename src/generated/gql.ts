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
    "#graphql\n  query GetMedia($uri: String!, $origin: String, $id: String) {\n    Media(uri: $uri, origin: $origin, id: $id) {\n      handler\n      origin\n      id\n      uri\n      url\n      title {\n        romanized\n        english\n        native\n      }\n      popularity\n      shortDescription\n      description\n      season\n      seasonYear\n      coverImage {\n        color\n        default\n      }\n      bannerImage\n      handles {\n        edges {\n          node {\n            handler\n            origin\n            id\n            uri\n            url\n            title {\n              romanized\n              english\n              native\n            }\n            trailers {\n              handler\n              origin\n              id\n              uri\n              url\n              thumbnail\n            }\n            season\n            seasonYear\n            popularity\n            shortDescription\n            description\n            handles {\n              edges {\n                node {\n                  handler\n                  origin\n                  id\n                  uri\n                  url\n                }\n              }\n            }\n            episodes {\n              edges {\n                node {\n                  airingAt\n                  number\n                  uri\n                  mediaUri\n                  timeUntilAiring\n                  thumbnail\n                  title {\n                    romanized\n                    english\n                    native\n                  }\n                  description\n                }\n              }\n            }\n          }\n        }\n      }\n      trailers {\n        handler\n        origin\n        id\n        uri\n        url\n        thumbnail\n      }\n      episodes {\n        edges {\n          node {\n            handler\n            origin\n            id\n            uri\n            url\n            airingAt\n            number\n            mediaUri\n            timeUntilAiring\n            thumbnail\n            title {\n              romanized\n              english\n              native\n            }\n            description\n          }\n        }\n      }\n    }\n  }\n": types.GetMediaDocument,
    "#graphql\n  query GetOrigins($ids: [String!]) {\n    Page {\n      origin(ids: $ids) {\n        id\n        name\n        official\n        metadataOnly\n      }\n    }\n  }\n": types.GetOriginsDocument,
    "#graphql\n  query GET_CURRENT_SEASON($season: MediaSeason!, $seasonYear: Int! $sort: [MediaSort]!) {\n    Page {\n      media(season: $season, seasonYear: $seasonYear, sort: $sort) {\n        handler\n        origin\n        id\n        uri\n        url\n        title {\n          romanized\n          english\n          native\n        }\n        popularity\n        shortDescription\n        description\n        coverImage {\n          color\n          default\n        }\n        season\n        seasonYear\n        startDate {\n          day\n          month\n          year\n        }\n        endDate {\n          day\n          month\n          year\n        }\n        episodeCount\n        bannerImage\n        handles {\n          edges {\n            node {\n              handler\n              origin\n              id\n              uri\n              url\n              episodeCount\n              season\n              seasonYear\n              startDate {\n                day\n                month\n                year\n              }\n              endDate {\n                day\n                month\n                year\n              }\n              title {\n                romanized\n                english\n                native\n              }\n              popularity\n              shortDescription\n              description\n            }\n          }\n        }\n        trailers {\n          handler\n          origin\n          id\n          uri\n          url\n          thumbnail\n        }\n      }\n    }\n  }\n": types.Get_Current_SeasonDocument,
    "#graphql\n  query GetPlaybackSources($uri: String, $origin: String, $id: String, $search: String, $name: String, $resolution: String, $season: Int, $number: Float) {\n    Page {\n      playbackSource(uri: $uri, origin: $origin, id: $id, search: $search, name: $name, resolution: $resolution, season: $season, number: $number) {\n        handler\n        origin\n        id\n        uri\n        url\n        type\n        filename\n        title {\n          romanized\n          english\n          native\n        }\n        structure\n        filesCount\n        bytes\n        uploadDate\n        thumbnails\n        team {\n          handler\n          origin\n          id\n          uri\n          url\n          name\n        }\n        resolution\n        hash\n        format\n        episodeRange\n        data\n      }\n    }\n  }\n": types.GetPlaybackSourcesDocument,
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
export function gql(source: "#graphql\n  query GetMedia($uri: String!, $origin: String, $id: String) {\n    Media(uri: $uri, origin: $origin, id: $id) {\n      handler\n      origin\n      id\n      uri\n      url\n      title {\n        romanized\n        english\n        native\n      }\n      popularity\n      shortDescription\n      description\n      season\n      seasonYear\n      coverImage {\n        color\n        default\n      }\n      bannerImage\n      handles {\n        edges {\n          node {\n            handler\n            origin\n            id\n            uri\n            url\n            title {\n              romanized\n              english\n              native\n            }\n            trailers {\n              handler\n              origin\n              id\n              uri\n              url\n              thumbnail\n            }\n            season\n            seasonYear\n            popularity\n            shortDescription\n            description\n            handles {\n              edges {\n                node {\n                  handler\n                  origin\n                  id\n                  uri\n                  url\n                }\n              }\n            }\n            episodes {\n              edges {\n                node {\n                  airingAt\n                  number\n                  uri\n                  mediaUri\n                  timeUntilAiring\n                  thumbnail\n                  title {\n                    romanized\n                    english\n                    native\n                  }\n                  description\n                }\n              }\n            }\n          }\n        }\n      }\n      trailers {\n        handler\n        origin\n        id\n        uri\n        url\n        thumbnail\n      }\n      episodes {\n        edges {\n          node {\n            handler\n            origin\n            id\n            uri\n            url\n            airingAt\n            number\n            mediaUri\n            timeUntilAiring\n            thumbnail\n            title {\n              romanized\n              english\n              native\n            }\n            description\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["#graphql\n  query GetMedia($uri: String!, $origin: String, $id: String) {\n    Media(uri: $uri, origin: $origin, id: $id) {\n      handler\n      origin\n      id\n      uri\n      url\n      title {\n        romanized\n        english\n        native\n      }\n      popularity\n      shortDescription\n      description\n      season\n      seasonYear\n      coverImage {\n        color\n        default\n      }\n      bannerImage\n      handles {\n        edges {\n          node {\n            handler\n            origin\n            id\n            uri\n            url\n            title {\n              romanized\n              english\n              native\n            }\n            trailers {\n              handler\n              origin\n              id\n              uri\n              url\n              thumbnail\n            }\n            season\n            seasonYear\n            popularity\n            shortDescription\n            description\n            handles {\n              edges {\n                node {\n                  handler\n                  origin\n                  id\n                  uri\n                  url\n                }\n              }\n            }\n            episodes {\n              edges {\n                node {\n                  airingAt\n                  number\n                  uri\n                  mediaUri\n                  timeUntilAiring\n                  thumbnail\n                  title {\n                    romanized\n                    english\n                    native\n                  }\n                  description\n                }\n              }\n            }\n          }\n        }\n      }\n      trailers {\n        handler\n        origin\n        id\n        uri\n        url\n        thumbnail\n      }\n      episodes {\n        edges {\n          node {\n            handler\n            origin\n            id\n            uri\n            url\n            airingAt\n            number\n            mediaUri\n            timeUntilAiring\n            thumbnail\n            title {\n              romanized\n              english\n              native\n            }\n            description\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "#graphql\n  query GetOrigins($ids: [String!]) {\n    Page {\n      origin(ids: $ids) {\n        id\n        name\n        official\n        metadataOnly\n      }\n    }\n  }\n"): (typeof documents)["#graphql\n  query GetOrigins($ids: [String!]) {\n    Page {\n      origin(ids: $ids) {\n        id\n        name\n        official\n        metadataOnly\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "#graphql\n  query GET_CURRENT_SEASON($season: MediaSeason!, $seasonYear: Int! $sort: [MediaSort]!) {\n    Page {\n      media(season: $season, seasonYear: $seasonYear, sort: $sort) {\n        handler\n        origin\n        id\n        uri\n        url\n        title {\n          romanized\n          english\n          native\n        }\n        popularity\n        shortDescription\n        description\n        coverImage {\n          color\n          default\n        }\n        season\n        seasonYear\n        startDate {\n          day\n          month\n          year\n        }\n        endDate {\n          day\n          month\n          year\n        }\n        episodeCount\n        bannerImage\n        handles {\n          edges {\n            node {\n              handler\n              origin\n              id\n              uri\n              url\n              episodeCount\n              season\n              seasonYear\n              startDate {\n                day\n                month\n                year\n              }\n              endDate {\n                day\n                month\n                year\n              }\n              title {\n                romanized\n                english\n                native\n              }\n              popularity\n              shortDescription\n              description\n            }\n          }\n        }\n        trailers {\n          handler\n          origin\n          id\n          uri\n          url\n          thumbnail\n        }\n      }\n    }\n  }\n"): (typeof documents)["#graphql\n  query GET_CURRENT_SEASON($season: MediaSeason!, $seasonYear: Int! $sort: [MediaSort]!) {\n    Page {\n      media(season: $season, seasonYear: $seasonYear, sort: $sort) {\n        handler\n        origin\n        id\n        uri\n        url\n        title {\n          romanized\n          english\n          native\n        }\n        popularity\n        shortDescription\n        description\n        coverImage {\n          color\n          default\n        }\n        season\n        seasonYear\n        startDate {\n          day\n          month\n          year\n        }\n        endDate {\n          day\n          month\n          year\n        }\n        episodeCount\n        bannerImage\n        handles {\n          edges {\n            node {\n              handler\n              origin\n              id\n              uri\n              url\n              episodeCount\n              season\n              seasonYear\n              startDate {\n                day\n                month\n                year\n              }\n              endDate {\n                day\n                month\n                year\n              }\n              title {\n                romanized\n                english\n                native\n              }\n              popularity\n              shortDescription\n              description\n            }\n          }\n        }\n        trailers {\n          handler\n          origin\n          id\n          uri\n          url\n          thumbnail\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "#graphql\n  query GetPlaybackSources($uri: String, $origin: String, $id: String, $search: String, $name: String, $resolution: String, $season: Int, $number: Float) {\n    Page {\n      playbackSource(uri: $uri, origin: $origin, id: $id, search: $search, name: $name, resolution: $resolution, season: $season, number: $number) {\n        handler\n        origin\n        id\n        uri\n        url\n        type\n        filename\n        title {\n          romanized\n          english\n          native\n        }\n        structure\n        filesCount\n        bytes\n        uploadDate\n        thumbnails\n        team {\n          handler\n          origin\n          id\n          uri\n          url\n          name\n        }\n        resolution\n        hash\n        format\n        episodeRange\n        data\n      }\n    }\n  }\n"): (typeof documents)["#graphql\n  query GetPlaybackSources($uri: String, $origin: String, $id: String, $search: String, $name: String, $resolution: String, $season: Int, $number: Float) {\n    Page {\n      playbackSource(uri: $uri, origin: $origin, id: $id, search: $search, name: $name, resolution: $resolution, season: $season, number: $number) {\n        handler\n        origin\n        id\n        uri\n        url\n        type\n        filename\n        title {\n          romanized\n          english\n          native\n        }\n        structure\n        filesCount\n        bytes\n        uploadDate\n        thumbnails\n        team {\n          handler\n          origin\n          id\n          uri\n          url\n          name\n        }\n        resolution\n        hash\n        format\n        episodeRange\n        data\n      }\n    }\n  }\n"];

export function gql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;