/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  /** ISO 3166-1 alpha-2 country code */
  CountryCode: any;
  /** ISO 8601:2004 date-time */
  Date: any;
  /** 8 digit long date integer (YYYYMMDD). Unknown dates represented by 0. E.g. 2016: 20160000, May 1976: 19760500 */
  FuzzyDateInt: any;
  /** ISO 21778:2017 JavaScript Object Notation (JSON) */
  Json: any;
  /** RFC 3986 uniform resource identifier (URI) as stricter form "scheme:path */
  Uri: any;
};

export enum ExternalLinkMediaType {
  Anime = 'ANIME',
  Manga = 'MANGA',
  Staff = 'STAFF'
}

export enum ExternalLinkType {
  Info = 'INFO',
  Social = 'SOCIAL',
  Streaming = 'STREAMING'
}

/** Date object that allows for incomplete date values (fuzzy) */
export type FuzzyDate = {
  __typename?: 'FuzzyDate';
  /** Numeric Day (24) */
  day?: Maybe<Scalars['Int']>;
  /** Numeric Month (3) */
  month?: Maybe<Scalars['Int']>;
  /** Numeric Year (2017) */
  year?: Maybe<Scalars['Int']>;
};

/** Date object that allows for incomplete date values (fuzzy) */
export type FuzzyDateInput = {
  /** Numeric Day (24) */
  day?: InputMaybe<Scalars['Int']>;
  /** Numeric Month (3) */
  month?: InputMaybe<Scalars['Int']>;
  /** Numeric Year (2017) */
  year?: InputMaybe<Scalars['Int']>;
};

/**  A Handle represents a unique identifier for a resource.  */
export type Handle = {
  /**  The name of the handler, e.g: 'fkn' for packages handled by FKN  */
  handler: Scalars['String'];
  handles: HandleConnection;
  /**  The id of the resource, e.g: 'react' for the React package  */
  id: Scalars['String'];
  /**  The origin of the resource, e.g: 'npm', generally the host of the resource  */
  origin: Scalars['String'];
  /**
   * The uri of the resource.
   * An uri is the combination of the handler, the origin and the id
   * e.g: 'fkn:npm:react' for the React package
   */
  uri: Scalars['Uri'];
  /**  The URL of the resource, e.g: 'https://npmjs.com/package/react'  */
  url?: Maybe<Scalars['String']>;
};

export type HandleConnection = {
  edges: Array<HandleEdge>;
  nodes: Array<Handle>;
  /** The pagination information */
  pageInfo?: Maybe<PageInfo>;
};

export type HandleEdge = {
  /** The relation between the two handles */
  handleRelationType: HandleRelation;
  node: Handle;
};

export enum HandleRelation {
  Identical = 'IDENTICAL'
}

/**
 * Media is a type of handle that represents a media file.
 * It generally represents a Movie, TV Show, Game, Package, ect...
 */
export type Media = Handle & {
  __typename?: 'Media';
  /** The average score of the media */
  averageScore?: Maybe<Scalars['Int']>;
  /** The banner image of the media */
  bannerImage?: Maybe<Array<Maybe<Scalars['String']>>>;
  /** The cover images of the media */
  coverImage?: Maybe<Array<Maybe<MediaCoverImage>>>;
  /** Long description of the media's story and characters */
  description?: Maybe<Scalars['String']>;
  /** The last official release date of the media */
  endDate?: Maybe<FuzzyDate>;
  /** External links to another site related to the media */
  externalLinks?: Maybe<Array<Maybe<MediaExternalLink>>>;
  format?: Maybe<MediaFormat>;
  handler: Scalars['String'];
  handles: MediaConnection;
  id: Scalars['String'];
  /** If the media is intended only for 18+ adult audiences */
  isAdult?: Maybe<Scalars['Boolean']>;
  origin: Scalars['String'];
  /** The number of users with the media on their list */
  popularity?: Maybe<Scalars['Int']>;
  /** The season the media was initially released in */
  season?: Maybe<MediaSeason>;
  /** The season year the media was initially released in */
  seasonYear?: Maybe<Scalars['Int']>;
  /** Short description of the media's story and characters */
  shortDescription?: Maybe<Scalars['String']>;
  /** The first official release date of the media */
  startDate?: Maybe<FuzzyDate>;
  /** The current releasing status of the media */
  status?: Maybe<MediaStatus>;
  /** Alternative titles of the media */
  synonyms?: Maybe<Array<Maybe<MediaSynonym>>>;
  /** The official titles of the media in various languages */
  title?: Maybe<MediaTitle>;
  /** Media trailer or advertisement */
  trailers?: Maybe<Array<Maybe<MediaTrailer>>>;
  /** The type of the media */
  type?: Maybe<MediaType>;
  uri: Scalars['Uri'];
  url?: Maybe<Scalars['String']>;
};


/**
 * Media is a type of handle that represents a media file.
 * It generally represents a Movie, TV Show, Game, Package, ect...
 */
export type MediaDescriptionArgs = {
  asHtml?: InputMaybe<Scalars['Boolean']>;
};


/**
 * Media is a type of handle that represents a media file.
 * It generally represents a Movie, TV Show, Game, Package, ect...
 */
export type MediaShortDescriptionArgs = {
  asHtml?: InputMaybe<Scalars['Boolean']>;
};

export type MediaConnection = HandleConnection & {
  __typename?: 'MediaConnection';
  edges: Array<MediaEdge>;
  nodes: Array<Media>;
  /** The pagination information */
  pageInfo?: Maybe<PageInfo>;
};

/** The cover images of the media */
export type MediaCoverImage = {
  __typename?: 'MediaCoverImage';
  /** Average #hex color of cover image */
  color?: Maybe<Scalars['String']>;
  /** The cover image of the media by default. Using highest resolution available. */
  default?: Maybe<Scalars['String']>;
  /** The cover image of the media at its largest size. 500x735 */
  extraLarge?: Maybe<Scalars['String']>;
  /** The cover image of the media at large size. 250x367 */
  large?: Maybe<Scalars['String']>;
  /** The cover image of the media at medium size. 120x171 */
  medium?: Maybe<Scalars['String']>;
  /** The cover image of the media at small size. 64x92 */
  small?: Maybe<Scalars['String']>;
};

export type MediaEdge = HandleEdge & {
  __typename?: 'MediaEdge';
  /** The relation between the two handles */
  handleRelationType: HandleRelation;
  node: Media;
};

/** An external link to another site related to the media or its properties */
export type MediaExternalLink = Handle & {
  __typename?: 'MediaExternalLink';
  color?: Maybe<Scalars['String']>;
  handler: Scalars['String'];
  handles: HandleConnection;
  /** The icon image url of the site. Not available for all links */
  icon?: Maybe<Scalars['String']>;
  id: Scalars['String'];
  isDisabled?: Maybe<Scalars['Boolean']>;
  /** Language the site content is in */
  language?: Maybe<Scalars['String']>;
  notes?: Maybe<Scalars['String']>;
  origin: Scalars['String'];
  type?: Maybe<ExternalLinkType>;
  uri: Scalars['Uri'];
  url?: Maybe<Scalars['String']>;
};

/** The format the media was released in */
export enum MediaFormat {
  /** Professionally published manga with more than one chapter */
  Manga = 'MANGA',
  /** Anime movies with a theatrical release */
  Movie = 'MOVIE',
  /** Short anime released as a music video */
  Music = 'MUSIC',
  /** Written books released as a series of light novels */
  Novel = 'NOVEL',
  /** (Original Net Animation) Anime that have been originally released online or are only available through streaming services. */
  Ona = 'ONA',
  /** Manga with just one chapter */
  OneShot = 'ONE_SHOT',
  /**
   * (Original Video Animation) Anime that have been released directly on
   * DVD/Blu-ray without originally going through a theatrical release or
   * television broadcast
   */
  Ova = 'OVA',
  /** Special episodes that have been included in DVD/Blu-ray releases, picture dramas, pilots, etc */
  Special = 'SPECIAL',
  /** Anime broadcast on television */
  Tv = 'TV',
  /** Anime which are under 15 minutes in length and broadcast on television */
  TvShort = 'TV_SHORT'
}

export enum MediaSeason {
  /** Months September to November */
  Fall = 'FALL',
  /** Months March to May */
  Spring = 'SPRING',
  /** Months June to August */
  Summer = 'SUMMER',
  /** Months December to February */
  Winter = 'WINTER'
}

export enum MediaSort {
  EndDate = 'END_DATE',
  EndDateDesc = 'END_DATE_DESC',
  Format = 'FORMAT',
  FormatDesc = 'FORMAT_DESC',
  Id = 'ID',
  IdDesc = 'ID_DESC',
  Popularity = 'POPULARITY',
  PopularityDesc = 'POPULARITY_DESC',
  Score = 'SCORE',
  ScoreDesc = 'SCORE_DESC',
  SearchMatch = 'SEARCH_MATCH',
  StartDate = 'START_DATE',
  StartDateDesc = 'START_DATE_DESC',
  Status = 'STATUS',
  StatusDesc = 'STATUS_DESC',
  TitleEnglish = 'TITLE_ENGLISH',
  TitleEnglishDesc = 'TITLE_ENGLISH_DESC',
  TitleNative = 'TITLE_NATIVE',
  TitleNativeDesc = 'TITLE_NATIVE_DESC',
  TitleRomanized = 'TITLE_ROMANIZED',
  TitleRomanizedDesc = 'TITLE_ROMANIZED_DESC',
  Type = 'TYPE',
  TypeDesc = 'TYPE_DESC'
}

/** Source type the media was adapted from */
export enum MediaSource {
  /** Japanese Anime */
  Anime = 'ANIME',
  /** Comics excluding manga */
  Comic = 'COMIC',
  /** Self-published works */
  Doujinshi = 'DOUJINSHI',
  /** Games excluding video games */
  Game = 'GAME',
  /** Written work published in volumes */
  LightNovel = 'LIGHT_NOVEL',
  /** Live action media such as movies or TV show */
  LiveAction = 'LIVE_ACTION',
  /** Asian comic book */
  Manga = 'MANGA',
  /** Multimedia project */
  MultimediaProject = 'MULTIMEDIA_PROJECT',
  /** Written works not published in volumes */
  Novel = 'NOVEL',
  /** An original production not based of another work */
  Original = 'ORIGINAL',
  /** Other */
  Other = 'OTHER',
  /** Picture book */
  PictureBook = 'PICTURE_BOOK',
  /** Video game */
  VideoGame = 'VIDEO_GAME',
  /** Video game driven primary by text and narrative */
  VisualNovel = 'VISUAL_NOVEL',
  /** Written works published online */
  WebNovel = 'WEB_NOVEL'
}

/** The current releasing status of the media */
export enum MediaStatus {
  /** Ended before the work could be finished */
  Cancelled = 'CANCELLED',
  /** Has completed and is no longer being released */
  Finished = 'FINISHED',
  /** Is currently paused from releasing and will resume at a later date */
  Hiatus = 'HIATUS',
  /** To be released at a later date */
  NotYetReleased = 'NOT_YET_RELEASED',
  /** Currently releasing */
  Releasing = 'RELEASING'
}

/** Alternative titles of the media */
export type MediaSynonym = {
  __typename?: 'MediaSynonym';
  /** Is alternative title a romanized version of the native title */
  isRomanized?: Maybe<Scalars['Boolean']>;
  /** The language the title is in */
  language?: Maybe<Scalars['String']>;
  /** The score of the title based on searchability */
  score?: Maybe<Scalars['Float']>;
  /** The alternative title */
  synonym?: Maybe<Scalars['String']>;
};

/** The official titles of the media in various languages */
export type MediaTitle = {
  __typename?: 'MediaTitle';
  /** The official english title */
  english?: Maybe<Scalars['String']>;
  /** The official language title */
  language?: Maybe<Scalars['String']>;
  /** Official title in it's native language */
  native?: Maybe<Scalars['String']>;
  /** Official title in it's romanized form */
  romanized?: Maybe<Scalars['String']>;
  /** The currently authenticated users preferred title language. Default english */
  userPreferred?: Maybe<Scalars['String']>;
};


/** The official titles of the media in various languages */
export type MediaTitleLanguageArgs = {
  countryCode?: InputMaybe<Scalars['CountryCode']>;
};

/** Media trailer or advertisement */
export type MediaTrailer = Handle & {
  __typename?: 'MediaTrailer';
  handler: Scalars['String'];
  handles: HandleConnection;
  id: Scalars['String'];
  origin: Scalars['String'];
  /** The url for the thumbnail image of the video */
  thumbnail?: Maybe<Scalars['String']>;
  uri: Scalars['Uri'];
  url?: Maybe<Scalars['String']>;
};

/** The type of the media */
export enum MediaType {
  /** Japanese Anime */
  Anime = 'ANIME',
  /** Comics excluding manga */
  Comic = 'COMIC',
  /** Self-published works */
  Doujinshi = 'DOUJINSHI',
  /** Games excluding video games */
  Game = 'GAME',
  /** Written work published in volumes */
  LightNovel = 'LIGHT_NOVEL',
  /** Live action media such as movies or TV show */
  LiveAction = 'LIVE_ACTION',
  /** Asian comic book */
  Manga = 'MANGA',
  /** Movies with a theatrical release */
  Movie = 'MOVIE',
  /** Multimedia project */
  MultimediaProject = 'MULTIMEDIA_PROJECT',
  /** Short anime released as a music video */
  Music = 'MUSIC',
  /** Written works not published in volumes */
  Novel = 'NOVEL',
  /** (Original Net Animation) Anime that have been originally released online or are only available through streaming services. */
  Ona = 'ONA',
  /** Manga with just one chapter */
  OneShot = 'ONE_SHOT',
  /** Other */
  Other = 'OTHER',
  /**
   * (Original Video Animation) Anime that have been released directly on
   * DVD/Blu-ray without originally going through a theatrical release or
   * television broadcast
   */
  Ova = 'OVA',
  /** Picture book */
  PictureBook = 'PICTURE_BOOK',
  /** Software */
  Software = 'SOFTWARE',
  /** Special episodes that have been included in DVD/Blu-ray releases, pilots, etc */
  Special = 'SPECIAL',
  /** Media broadcast on television */
  Tv = 'TV',
  /** Media which are under 15 minutes in length and broadcast on television */
  TvShort = 'TV_SHORT',
  /** Video */
  Video = 'VIDEO',
  /** Video game */
  VideoGame = 'VIDEO_GAME',
  /** Video game driven primary by text and narrative */
  VisualNovel = 'VISUAL_NOVEL',
  /** Written works published online */
  WebNovel = 'WEB_NOVEL'
}

export type Mutation = {
  __typename?: 'Mutation';
  dummy?: Maybe<Scalars['String']>;
};

export type Page = {
  __typename?: 'Page';
  media?: Maybe<Array<Media>>;
  pageInfo?: Maybe<PageInfo>;
};


export type PageMediaArgs = {
  endDate?: InputMaybe<Scalars['FuzzyDateInt']>;
  endDate_greater?: InputMaybe<Scalars['FuzzyDateInt']>;
  endDate_lesser?: InputMaybe<Scalars['FuzzyDateInt']>;
  endDate_like?: InputMaybe<Scalars['String']>;
  id?: InputMaybe<Scalars['String']>;
  origin?: InputMaybe<Scalars['String']>;
  search?: InputMaybe<Scalars['String']>;
  season?: InputMaybe<MediaSeason>;
  seasonYear?: InputMaybe<Scalars['Int']>;
  sort?: InputMaybe<Array<InputMaybe<MediaSort>>>;
  startDate?: InputMaybe<Scalars['FuzzyDateInt']>;
  startDate_greater?: InputMaybe<Scalars['FuzzyDateInt']>;
  startDate_lesser?: InputMaybe<Scalars['FuzzyDateInt']>;
  startDate_like?: InputMaybe<Scalars['String']>;
  status?: InputMaybe<MediaStatus>;
  status_in?: InputMaybe<Array<InputMaybe<MediaStatus>>>;
  status_not?: InputMaybe<MediaStatus>;
  status_not_in?: InputMaybe<Array<InputMaybe<MediaStatus>>>;
  uri?: InputMaybe<Scalars['String']>;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  /** The current page */
  currentPageCursor?: Maybe<Scalars['String']>;
  /** The first page */
  firstPageCursor?: Maybe<Scalars['String']>;
  /** Total number of items on the current page */
  inPage?: Maybe<Scalars['Int']>;
  /** The last page cursor */
  lastPageCursor?: Maybe<Scalars['String']>;
  /** The current page */
  nextPageCursor?: Maybe<Scalars['String']>;
  /** The current page */
  previousPageCursor?: Maybe<Scalars['String']>;
  /** The total number of items. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  total?: Maybe<Scalars['Int']>;
  /** Total number of items after the current page. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  totalAfter?: Maybe<Scalars['Int']>;
  /** Total number of items before the current page. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  totalBefore?: Maybe<Scalars['Int']>;
};

export type Query = {
  __typename?: 'Query';
  Media?: Maybe<Media>;
  Page?: Maybe<Page>;
  dummy?: Maybe<Scalars['String']>;
};


export type QueryMediaArgs = {
  endDate?: InputMaybe<Scalars['FuzzyDateInt']>;
  endDate_greater?: InputMaybe<Scalars['FuzzyDateInt']>;
  endDate_lesser?: InputMaybe<Scalars['FuzzyDateInt']>;
  endDate_like?: InputMaybe<Scalars['String']>;
  id?: InputMaybe<Scalars['String']>;
  origin?: InputMaybe<Scalars['String']>;
  search?: InputMaybe<Scalars['String']>;
  season?: InputMaybe<MediaSeason>;
  seasonYear?: InputMaybe<Scalars['Int']>;
  sort?: InputMaybe<Array<InputMaybe<MediaSort>>>;
  startDate?: InputMaybe<Scalars['FuzzyDateInt']>;
  startDate_greater?: InputMaybe<Scalars['FuzzyDateInt']>;
  startDate_lesser?: InputMaybe<Scalars['FuzzyDateInt']>;
  startDate_like?: InputMaybe<Scalars['String']>;
  status?: InputMaybe<MediaStatus>;
  status_in?: InputMaybe<Array<InputMaybe<MediaStatus>>>;
  status_not?: InputMaybe<MediaStatus>;
  status_not_in?: InputMaybe<Array<InputMaybe<MediaStatus>>>;
  uri?: InputMaybe<Scalars['String']>;
};


export type QueryPageArgs = {
  after?: InputMaybe<Scalars['Int']>;
  at?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['Int']>;
};

export type Resource = Handle & {
  __typename?: 'Resource';
  batchResources: Array<ResourceConnection>;
  handler: Scalars['String'];
  handles: ResourceConnection;
  id: Scalars['String'];
  isBatch?: Maybe<Scalars['Boolean']>;
  origin: Scalars['String'];
  uri: Scalars['Uri'];
  url?: Maybe<Scalars['String']>;
};

export type ResourceConnection = HandleConnection & {
  __typename?: 'ResourceConnection';
  edges: Array<ResourceEdge>;
  nodes: Array<Resource>;
  /** The pagination information */
  pageInfo?: Maybe<PageInfo>;
};

export type ResourceEdge = HandleEdge & {
  __typename?: 'ResourceEdge';
  /** The relation between the two handles */
  handleRelationType: HandleRelation;
  node: Resource;
};

export type Get_MediaQueryVariables = Exact<{
  uri: Scalars['String'];
}>;


export type Get_MediaQuery = { __typename?: 'Query', Media?: { __typename?: 'Media', handler: string, origin: string, id: string, uri: any, url?: string | null, popularity?: number | null, shortDescription?: string | null, description?: string | null, bannerImage?: Array<string | null> | null, title?: { __typename?: 'MediaTitle', romanized?: string | null, english?: string | null, native?: string | null } | null, coverImage?: Array<{ __typename?: 'MediaCoverImage', color?: string | null, default?: string | null } | null> | null, handles: { __typename?: 'MediaConnection', nodes: Array<{ __typename?: 'Media', handler: string, origin: string, id: string, uri: any, url?: string | null, popularity?: number | null, shortDescription?: string | null, description?: string | null, title?: { __typename?: 'MediaTitle', romanized?: string | null } | null, handles: { __typename?: 'MediaConnection', nodes: Array<{ __typename?: 'Media', handler: string, origin: string, id: string, uri: any, url?: string | null, popularity?: number | null, shortDescription?: string | null, description?: string | null, title?: { __typename?: 'MediaTitle', romanized?: string | null } | null }> } }> }, trailers?: Array<{ __typename?: 'MediaTrailer', handler: string, origin: string, id: string, uri: any, url?: string | null, thumbnail?: string | null } | null> | null } | null };

export type Get_Current_SeasonQueryVariables = Exact<{
  season: MediaSeason;
  seasonYear: Scalars['Int'];
  sort: Array<InputMaybe<MediaSort>> | InputMaybe<MediaSort>;
}>;


export type Get_Current_SeasonQuery = { __typename?: 'Query', Page?: { __typename?: 'Page', media?: Array<{ __typename?: 'Media', handler: string, origin: string, id: string, uri: any, url?: string | null, popularity?: number | null, shortDescription?: string | null, description?: string | null, bannerImage?: Array<string | null> | null, title?: { __typename?: 'MediaTitle', romanized?: string | null, english?: string | null, native?: string | null } | null, coverImage?: Array<{ __typename?: 'MediaCoverImage', color?: string | null, default?: string | null } | null> | null, handles: { __typename?: 'MediaConnection', nodes: Array<{ __typename?: 'Media', handler: string, origin: string, id: string, uri: any, url?: string | null, popularity?: number | null, shortDescription?: string | null, description?: string | null, title?: { __typename?: 'MediaTitle', romanized?: string | null } | null }> }, trailers?: Array<{ __typename?: 'MediaTrailer', handler: string, origin: string, id: string, uri: any, url?: string | null, thumbnail?: string | null } | null> | null }> | null } | null };


export const Get_MediaDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GET_MEDIA"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uri"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"Media"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uri"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uri"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handler"}},{"kind":"Field","name":{"kind":"Name","value":"origin"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"uri"}},{"kind":"Field","name":{"kind":"Name","value":"url"}},{"kind":"Field","name":{"kind":"Name","value":"title"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"romanized"}},{"kind":"Field","name":{"kind":"Name","value":"english"}},{"kind":"Field","name":{"kind":"Name","value":"native"}}]}},{"kind":"Field","name":{"kind":"Name","value":"popularity"}},{"kind":"Field","name":{"kind":"Name","value":"shortDescription"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"coverImage"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"default"}}]}},{"kind":"Field","name":{"kind":"Name","value":"bannerImage"}},{"kind":"Field","name":{"kind":"Name","value":"handles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handler"}},{"kind":"Field","name":{"kind":"Name","value":"origin"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"uri"}},{"kind":"Field","name":{"kind":"Name","value":"url"}},{"kind":"Field","name":{"kind":"Name","value":"title"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"romanized"}}]}},{"kind":"Field","name":{"kind":"Name","value":"popularity"}},{"kind":"Field","name":{"kind":"Name","value":"shortDescription"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"handles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handler"}},{"kind":"Field","name":{"kind":"Name","value":"origin"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"uri"}},{"kind":"Field","name":{"kind":"Name","value":"url"}},{"kind":"Field","name":{"kind":"Name","value":"title"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"romanized"}}]}},{"kind":"Field","name":{"kind":"Name","value":"popularity"}},{"kind":"Field","name":{"kind":"Name","value":"shortDescription"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"trailers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handler"}},{"kind":"Field","name":{"kind":"Name","value":"origin"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"uri"}},{"kind":"Field","name":{"kind":"Name","value":"url"}},{"kind":"Field","name":{"kind":"Name","value":"thumbnail"}}]}}]}}]}}]} as unknown as DocumentNode<Get_MediaQuery, Get_MediaQueryVariables>;
export const Get_Current_SeasonDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GET_CURRENT_SEASON"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"season"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"MediaSeason"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"seasonYear"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sort"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NamedType","name":{"kind":"Name","value":"MediaSort"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"Page"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"media"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"season"},"value":{"kind":"Variable","name":{"kind":"Name","value":"season"}}},{"kind":"Argument","name":{"kind":"Name","value":"seasonYear"},"value":{"kind":"Variable","name":{"kind":"Name","value":"seasonYear"}}},{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sort"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handler"}},{"kind":"Field","name":{"kind":"Name","value":"origin"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"uri"}},{"kind":"Field","name":{"kind":"Name","value":"url"}},{"kind":"Field","name":{"kind":"Name","value":"title"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"romanized"}},{"kind":"Field","name":{"kind":"Name","value":"english"}},{"kind":"Field","name":{"kind":"Name","value":"native"}}]}},{"kind":"Field","name":{"kind":"Name","value":"popularity"}},{"kind":"Field","name":{"kind":"Name","value":"shortDescription"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"coverImage"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"default"}}]}},{"kind":"Field","name":{"kind":"Name","value":"bannerImage"}},{"kind":"Field","name":{"kind":"Name","value":"handles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handler"}},{"kind":"Field","name":{"kind":"Name","value":"origin"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"uri"}},{"kind":"Field","name":{"kind":"Name","value":"url"}},{"kind":"Field","name":{"kind":"Name","value":"title"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"romanized"}}]}},{"kind":"Field","name":{"kind":"Name","value":"popularity"}},{"kind":"Field","name":{"kind":"Name","value":"shortDescription"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"trailers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handler"}},{"kind":"Field","name":{"kind":"Name","value":"origin"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"uri"}},{"kind":"Field","name":{"kind":"Name","value":"url"}},{"kind":"Field","name":{"kind":"Name","value":"thumbnail"}}]}}]}}]}}]}}]} as unknown as DocumentNode<Get_Current_SeasonQuery, Get_Current_SeasonQueryVariables>;