/* eslint-disable */
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** ISO 3166-1 alpha-2 country code */
  CountryCode: { input: any; output: any; }
  /** ISO 8601:2004 date-time */
  Date: { input: any; output: any; }
  /** 8 digit long date integer (YYYYMMDD). Unknown dates represented by 0. E.g. 2016: 20160000, May 1976: 19760500 */
  FuzzyDateInt: { input: any; output: any; }
  /** ISO 21778:2017 JavaScript Object Notation (JSON) */
  Json: { input: any; output: any; }
  /** RFC 3986 uniform resource identifier (URI) as stricter form "scheme:path */
  Uri: { input: any; output: any; }
};

export type Authenticate = {
  __typename?: 'Authenticate';
  oauth2?: Maybe<AuthenticateOauth2>;
};

export type AuthenticateInput = {
  oauth2?: InputMaybe<AuthenticateInputOauth2>;
  origin: Scalars['String']['input'];
  type: AuthenticationMethodType;
};

export type AuthenticateInputOauth2 = {
  authorizationCode: Scalars['String']['input'];
  clientId: Scalars['String']['input'];
  codeVerifier: Scalars['String']['input'];
  grantType: Scalars['String']['input'];
  redirectUri: Scalars['String']['input'];
};

export type AuthenticateOauth2 = {
  __typename?: 'AuthenticateOauth2';
  accessToken: Scalars['String']['output'];
  expiresIn: Scalars['Int']['output'];
  refreshToken: Scalars['String']['output'];
  tokenType: Scalars['String']['output'];
};

export type Authentication = {
  __typename?: 'Authentication';
  authentication?: Maybe<Scalars['Boolean']['output']>;
  methods?: Maybe<Array<AuthenticationMethod>>;
  origin: Origin;
};

export type AuthenticationMethod = {
  __typename?: 'AuthenticationMethod';
  body?: Maybe<Scalars['String']['output']>;
  headers?: Maybe<Array<AuthenticationMethodHeaderValue>>;
  type: AuthenticationMethodType;
  url?: Maybe<Scalars['String']['output']>;
};

export type AuthenticationMethodHeaderValue = {
  __typename?: 'AuthenticationMethodHeaderValue';
  key: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

export type AuthenticationMethodHeaderValueInput = {
  key: Scalars['String']['input'];
  value: Scalars['String']['input'];
};

export enum AuthenticationMethodType {
  Oauth2 = 'OAUTH2'
}

export type Episode = Handle & {
  __typename?: 'Episode';
  _id?: Maybe<Scalars['String']['output']>;
  /** The time the episode airs at */
  airingAt?: Maybe<Scalars['Float']['output']>;
  /** The description of the episode */
  description?: Maybe<Scalars['String']['output']>;
  handles: Array<Episode>;
  id: Scalars['String']['output'];
  /** The associate media of the episode */
  media?: Maybe<Media>;
  /** The associate media uri of the episode */
  mediaUri?: Maybe<Scalars['String']['output']>;
  /** The episode number */
  number?: Maybe<Scalars['Float']['output']>;
  origin: Scalars['String']['output'];
  /** The playback information for the episode */
  playback: Array<PlaybackSource>;
  /** The url for the thumbnail image of the video */
  thumbnail?: Maybe<Scalars['String']['output']>;
  /** Seconds until episode starts airing */
  timeUntilAiring?: Maybe<Scalars['Float']['output']>;
  /** The title of the episode */
  title?: Maybe<MediaTitle>;
  uri: Scalars['Uri']['output'];
  url?: Maybe<Scalars['String']['output']>;
};

export type EpisodeInput = {
  /** Filter by the media id */
  id?: InputMaybe<Scalars['String']['input']>;
  /** Filter by the media origin */
  origin?: InputMaybe<Scalars['String']['input']>;
  /** Filter by the media uri */
  uri?: InputMaybe<Scalars['Uri']['input']>;
};

export type EpisodePage = {
  __typename?: 'EpisodePage';
  /** The current page */
  currentPageCursor?: Maybe<Scalars['String']['output']>;
  /** The first page */
  firstPageCursor?: Maybe<Scalars['String']['output']>;
  /** Total number of items on the current page */
  inPage?: Maybe<Scalars['Int']['output']>;
  /** The last page cursor */
  lastPageCursor?: Maybe<Scalars['String']['output']>;
  /** The current page */
  nextPageCursor?: Maybe<Scalars['String']['output']>;
  /** The media page nodes */
  nodes: Array<Episode>;
  /** The current page */
  previousPageCursor?: Maybe<Scalars['String']['output']>;
  /** The total number of items. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  total?: Maybe<Scalars['Int']['output']>;
  /** Total number of items after the current page. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  totalAfter?: Maybe<Scalars['Int']['output']>;
  /** Total number of items before the current page. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  totalBefore?: Maybe<Scalars['Int']['output']>;
};

export type EpisodePageInput = {
  /** How many pages after the cursor to return */
  after?: InputMaybe<Scalars['Int']['input']>;
  /** Cursor from where to start */
  at?: InputMaybe<Scalars['String']['input']>;
  /** How many pages before the cursor to return */
  before?: InputMaybe<Scalars['Int']['input']>;
  /** Filter by the media id */
  id?: InputMaybe<Scalars['String']['input']>;
  /** Filter by the media origin */
  origin?: InputMaybe<Scalars['String']['input']>;
  /** Filter by search terms */
  search?: InputMaybe<Scalars['String']['input']>;
  /** The order the results will be returned in */
  sorts?: InputMaybe<Array<EpisodeSort>>;
  /** Filter by the media uri */
  uri?: InputMaybe<Scalars['Uri']['input']>;
};

export enum EpisodeSort {
  EndDate = 'END_DATE',
  EndDateDesc = 'END_DATE_DESC',
  Format = 'FORMAT',
  FormatDesc = 'FORMAT_DESC',
  Id = 'ID',
  IdDesc = 'ID_DESC',
  Latest = 'LATEST',
  Oldest = 'OLDEST',
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
  day?: Maybe<Scalars['Int']['output']>;
  /** Numeric Month (3) */
  month?: Maybe<Scalars['Int']['output']>;
  /** Numeric Year (2017) */
  year?: Maybe<Scalars['Int']['output']>;
};

/** Date object that allows for incomplete date values (fuzzy) */
export type FuzzyDateInput = {
  /** Numeric Day (24) */
  day?: InputMaybe<Scalars['Int']['input']>;
  /** Numeric Month (3) */
  month?: InputMaybe<Scalars['Int']['input']>;
  /** Numeric Year (2017) */
  year?: InputMaybe<Scalars['Int']['input']>;
};

/**  A Handle represents a unique identifier for a resource.  */
export type Handle = {
  _id?: Maybe<Scalars['String']['output']>;
  handles: Array<Handle>;
  /**  The id of the resource, e.g: 'react' for the React package  */
  id: Scalars['String']['output'];
  /**  The origin of the resource, e.g: 'npm', generally the host of the resource  */
  origin: Scalars['String']['output'];
  /**
   * The uri of the resource.
   * An uri is the combination of the handler, the origin and the id
   * e.g: 'fkn:npm:react' for the React package
   */
  uri: Scalars['Uri']['output'];
  /**  The URL of the resource, e.g: 'https://npmjs.com/package/react'  */
  url?: Maybe<Scalars['String']['output']>;
};

/**
 * Media is a type of handle that represents a media.
 * It generally represents a Movie, TV Show, Game, Package, ect...
 */
export type Media = Handle & {
  __typename?: 'Media';
  _id?: Maybe<Scalars['String']['output']>;
  /** The average score of the media */
  averageScore?: Maybe<Scalars['Float']['output']>;
  /** The banner image of the media */
  bannerImage?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  /** The cover images of the media */
  coverImage?: Maybe<Array<Maybe<MediaCoverImage>>>;
  /** Long description of the media's story and characters */
  description?: Maybe<Scalars['String']['output']>;
  /** The last official release date of the media */
  endDate?: Maybe<FuzzyDate>;
  episodeCount?: Maybe<Scalars['Int']['output']>;
  episodes: Array<Episode>;
  /** External links to another site related to the media */
  externalLinks?: Maybe<Array<Maybe<MediaExternalLink>>>;
  format?: Maybe<MediaFormat>;
  handles: Array<Media>;
  id: Scalars['String']['output'];
  /** If the media is intended only for 18+ adult audiences */
  isAdult?: Maybe<Scalars['Boolean']['output']>;
  origin: Scalars['String']['output'];
  /** The number of users with the media on their list */
  popularity?: Maybe<Scalars['Int']['output']>;
  /** The season the media was initially released in */
  season?: Maybe<MediaSeason>;
  /** The season year the media was initially released in */
  seasonYear?: Maybe<Scalars['Int']['output']>;
  /** Short description of the media's story and characters */
  shortDescription?: Maybe<Scalars['String']['output']>;
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
  uri: Scalars['Uri']['output'];
  url?: Maybe<Scalars['String']['output']>;
};


/**
 * Media is a type of handle that represents a media.
 * It generally represents a Movie, TV Show, Game, Package, ect...
 */
export type MediaDescriptionArgs = {
  asHtml?: InputMaybe<Scalars['Boolean']['input']>;
};


/**
 * Media is a type of handle that represents a media.
 * It generally represents a Movie, TV Show, Game, Package, ect...
 */
export type MediaEpisodesArgs = {
  notYetAired?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  perPage?: InputMaybe<Scalars['Int']['input']>;
};


/**
 * Media is a type of handle that represents a media.
 * It generally represents a Movie, TV Show, Game, Package, ect...
 */
export type MediaShortDescriptionArgs = {
  asHtml?: InputMaybe<Scalars['Boolean']['input']>;
};

/** Media Airing Schedule. NOTE: We only aim to guarantee that FUTURE airing data is present and accurate. */
export type MediaAiringSchedule = Handle & {
  __typename?: 'MediaAiringSchedule';
  _id?: Maybe<Scalars['String']['output']>;
  /** The time the episode airs at */
  airingAt?: Maybe<Scalars['Float']['output']>;
  /** The description of the episode */
  description?: Maybe<Scalars['String']['output']>;
  /** The airing episode number */
  episodeNumber: Scalars['Int']['output'];
  handles: Array<MediaAiringSchedule>;
  id: Scalars['String']['output'];
  /** The associate media of the airing episode */
  media?: Maybe<Media>;
  /** The associate media uri of the airing episode */
  mediaUri?: Maybe<Scalars['String']['output']>;
  origin: Scalars['String']['output'];
  /** The url for the thumbnail image of the video */
  thumbnail?: Maybe<Scalars['String']['output']>;
  /** Seconds until episode starts airing */
  timeUntilAiring?: Maybe<Scalars['Float']['output']>;
  /** The title of the episode */
  title?: Maybe<MediaTitle>;
  uri: Scalars['Uri']['output'];
  url?: Maybe<Scalars['String']['output']>;
};

/** The cover images of the media */
export type MediaCoverImage = {
  __typename?: 'MediaCoverImage';
  /** Average #hex color of cover image */
  color?: Maybe<Scalars['String']['output']>;
  /** The cover image of the media by default. Using highest resolution available. */
  default?: Maybe<Scalars['String']['output']>;
  /** The cover image of the media at its largest size. 500x735 */
  extraLarge?: Maybe<Scalars['String']['output']>;
  /** The cover image of the media at large size. 250x367 */
  large?: Maybe<Scalars['String']['output']>;
  /** The cover image of the media at medium size. 120x171 */
  medium?: Maybe<Scalars['String']['output']>;
  /** The cover image of the media at small size. 64x92 */
  small?: Maybe<Scalars['String']['output']>;
};

/** An external link to another site related to the media or its properties */
export type MediaExternalLink = Handle & {
  __typename?: 'MediaExternalLink';
  _id?: Maybe<Scalars['String']['output']>;
  color?: Maybe<Scalars['String']['output']>;
  handles: Array<MediaExternalLink>;
  /** The icon image url of the site. Not available for all links */
  icon?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  isDisabled?: Maybe<Scalars['Boolean']['output']>;
  /** Language the site content is in */
  language?: Maybe<Scalars['String']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  origin: Scalars['String']['output'];
  type?: Maybe<ExternalLinkType>;
  uri: Scalars['Uri']['output'];
  url?: Maybe<Scalars['String']['output']>;
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

export type MediaInput = {
  /** Filter by the media id */
  id?: InputMaybe<Scalars['String']['input']>;
  /** Filter by the media origin */
  origin?: InputMaybe<Scalars['String']['input']>;
  /** Filter by the media uri */
  uri?: InputMaybe<Scalars['Uri']['input']>;
};

export type MediaPage = {
  __typename?: 'MediaPage';
  /** The current page */
  currentPageCursor?: Maybe<Scalars['String']['output']>;
  /** The first page */
  firstPageCursor?: Maybe<Scalars['String']['output']>;
  /** Total number of items on the current page */
  inPage?: Maybe<Scalars['Int']['output']>;
  /** The last page cursor */
  lastPageCursor?: Maybe<Scalars['String']['output']>;
  /** The current page */
  nextPageCursor?: Maybe<Scalars['String']['output']>;
  /** The media page nodes */
  nodes: Array<Media>;
  /** The current page */
  previousPageCursor?: Maybe<Scalars['String']['output']>;
  /** The total number of items. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  total?: Maybe<Scalars['Int']['output']>;
  /** Total number of items after the current page. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  totalAfter?: Maybe<Scalars['Int']['output']>;
  /** Total number of items before the current page. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  totalBefore?: Maybe<Scalars['Int']['output']>;
};

export type MediaPageInput = {
  /** How many pages after the cursor to return */
  after?: InputMaybe<Scalars['Int']['input']>;
  /** Cursor from where to start */
  at?: InputMaybe<Scalars['String']['input']>;
  /** How many pages before the cursor to return */
  before?: InputMaybe<Scalars['Int']['input']>;
  /** Filter by the end date of the media */
  endDate?: InputMaybe<Scalars['FuzzyDateInt']['input']>;
  /** Filter by the media id */
  id?: InputMaybe<Scalars['String']['input']>;
  /** Filter by the media origin */
  origin?: InputMaybe<Scalars['String']['input']>;
  /** Filter by search terms */
  search?: InputMaybe<Scalars['String']['input']>;
  /** Filter by media season */
  season?: InputMaybe<MediaSeason>;
  /** Filter by the year of the media season */
  seasonYear?: InputMaybe<Scalars['Int']['input']>;
  /** The order the results will be returned in */
  sorts?: InputMaybe<Array<MediaSort>>;
  /** Filter by the start date of the media */
  startDate?: InputMaybe<Scalars['FuzzyDateInt']['input']>;
  /** Filter by the media's current release status */
  status?: InputMaybe<MediaStatus>;
  /** Filter by the media uri */
  uri?: InputMaybe<Scalars['Uri']['input']>;
};

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
  isRomanized?: Maybe<Scalars['Boolean']['output']>;
  /** The language the title is in */
  language?: Maybe<Scalars['String']['output']>;
  /** The score of the title based on searchability */
  score?: Maybe<Scalars['Float']['output']>;
  /** The alternative title */
  synonym?: Maybe<Scalars['String']['output']>;
};

/** The official titles of the media in various languages */
export type MediaTitle = {
  __typename?: 'MediaTitle';
  /** The official english title */
  english?: Maybe<Scalars['String']['output']>;
  /** The official language title */
  language?: Maybe<Scalars['String']['output']>;
  /** Official title in it's native language */
  native?: Maybe<Scalars['String']['output']>;
  /** Official title in it's romanized form */
  romanized?: Maybe<Scalars['String']['output']>;
  /** The currently authenticated users preferred title language. Default english */
  userPreferred?: Maybe<Scalars['String']['output']>;
};


/** The official titles of the media in various languages */
export type MediaTitleLanguageArgs = {
  countryCode?: InputMaybe<Scalars['CountryCode']['input']>;
};

/** Media trailer or advertisement */
export type MediaTrailer = Handle & {
  __typename?: 'MediaTrailer';
  _id?: Maybe<Scalars['String']['output']>;
  handles: Array<MediaTrailer>;
  id: Scalars['String']['output'];
  origin: Scalars['String']['output'];
  /** The url for the thumbnail image of the video */
  thumbnail?: Maybe<Scalars['String']['output']>;
  uri: Scalars['Uri']['output'];
  url?: Maybe<Scalars['String']['output']>;
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
  _empty?: Maybe<Scalars['String']['output']>;
  authenticate: Authenticate;
  updateUserMedia: UserMedia;
};


export type MutationAuthenticateArgs = {
  input: AuthenticateInput;
};


export type MutationUpdateUserMediaArgs = {
  input: UpdateUserMediaInput;
};

/**
 * Media is a type of handle that represents a media.
 * It generally represents a Movie, TV Show, Game, Package, ect...
 */
export type Origin = {
  __typename?: 'Origin';
  /** The media types of the target */
  categories: Array<MediaType>;
  /** The icon URL */
  icon?: Maybe<Scalars['String']['output']>;
  /** Origin ID, e.g: "nflx" for Netflix */
  id: Scalars['String']['output'];
  /** If the origin returns metadata only, e.g no playback or download data */
  metadataOnly?: Maybe<Scalars['Boolean']['output']>;
  /** Origin full name, e.g: "Netflix"  */
  name: Scalars['String']['output'];
  /** If the origin is official, e.g a legal redistributor or platform */
  official?: Maybe<Scalars['Boolean']['output']>;
  /** Origin ID, e.g: "nflx" for Netflix */
  origin: Scalars['String']['output'];
  supportedUris?: Maybe<Array<Scalars['String']['output']>>;
  /** The origin's URL, e.g "https://www.netflix.com/""  */
  url?: Maybe<Scalars['String']['output']>;
};

export type OriginInput = {
  /** Filter by origin categories */
  categories?: InputMaybe<Array<MediaType>>;
  /** Filter by the media id */
  id?: InputMaybe<Scalars['String']['input']>;
  /** Filter by if the origin only returns metadata */
  metadataOnly?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the media origin */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Filter by if the origin is official */
  official?: InputMaybe<Scalars['Boolean']['input']>;
};

export type OriginPageInput = {
  /** Filter by origin categories */
  categories?: InputMaybe<Array<MediaType>>;
  /** Filter by the media id */
  ids?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Filter by if the origin only returns metadata */
  metadataOnly?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by the media origin */
  names?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Filter by if the origin is official */
  official?: InputMaybe<Scalars['Boolean']['input']>;
};

export type PlaybackSource = Handle & {
  __typename?: 'PlaybackSource';
  _id?: Maybe<Scalars['String']['output']>;
  bytes?: Maybe<Scalars['Float']['output']>;
  /** Stringified (json?) data for the playback, useful for custom players */
  data?: Maybe<Scalars['String']['output']>;
  episode?: Maybe<Episode>;
  episodeRange?: Maybe<Scalars['String']['output']>;
  filename?: Maybe<Scalars['String']['output']>;
  filesCount?: Maybe<Scalars['Int']['output']>;
  format?: Maybe<Scalars['String']['output']>;
  handles: Array<PlaybackSource>;
  hash?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  media?: Maybe<Media>;
  origin: Scalars['String']['output'];
  resolution?: Maybe<Scalars['String']['output']>;
  structure?: Maybe<PlaybackSourceFileStructure>;
  team?: Maybe<Team>;
  thumbnails?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  title?: Maybe<MediaTitle>;
  /** The type of playback */
  type?: Maybe<PlaybackSourceType>;
  uploadDate?: Maybe<Scalars['Float']['output']>;
  uri: Scalars['Uri']['output'];
  url?: Maybe<Scalars['String']['output']>;
};

export enum PlaybackSourceFileStructure {
  Multi = 'MULTI',
  Single = 'SINGLE'
}

export type PlaybackSourceInput = {
  /** Filter by the media id */
  id?: InputMaybe<Scalars['String']['input']>;
  /** Filter by the media origin */
  origin?: InputMaybe<Scalars['String']['input']>;
  /** Filter by the media uri */
  uri?: InputMaybe<Scalars['Uri']['input']>;
};

export type PlaybackSourcePage = {
  __typename?: 'PlaybackSourcePage';
  /** The current page */
  currentPageCursor?: Maybe<Scalars['String']['output']>;
  /** The first page */
  firstPageCursor?: Maybe<Scalars['String']['output']>;
  /** Total number of items on the current page */
  inPage?: Maybe<Scalars['Int']['output']>;
  /** The last page cursor */
  lastPageCursor?: Maybe<Scalars['String']['output']>;
  /** The current page */
  nextPageCursor?: Maybe<Scalars['String']['output']>;
  /** The media page nodes */
  nodes: Array<PlaybackSource>;
  /** The current page */
  previousPageCursor?: Maybe<Scalars['String']['output']>;
  /** The total number of items. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  total?: Maybe<Scalars['Int']['output']>;
  /** Total number of items after the current page. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  totalAfter?: Maybe<Scalars['Int']['output']>;
  /** Total number of items before the current page. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  totalBefore?: Maybe<Scalars['Int']['output']>;
};

export type PlaybackSourcePageInput = {
  /** How many pages after the cursor to return */
  after?: InputMaybe<Scalars['Int']['input']>;
  /** Cursor from where to start */
  at?: InputMaybe<Scalars['String']['input']>;
  /** How many pages before the cursor to return */
  before?: InputMaybe<Scalars['Int']['input']>;
  /** Filter by the media id */
  id?: InputMaybe<Scalars['String']['input']>;
  number?: InputMaybe<Scalars['Int']['input']>;
  /** Filter by the media origin */
  origin?: InputMaybe<Scalars['String']['input']>;
  /** Filter by search terms */
  search?: InputMaybe<Scalars['String']['input']>;
  /** Filter by the media uri */
  uri?: InputMaybe<Scalars['Uri']['input']>;
};

export enum PlaybackSourceType {
  Custom = 'CUSTOM',
  Iframe = 'IFRAME',
  Other = 'OTHER',
  Torrent = 'TORRENT'
}

export type Query = {
  __typename?: 'Query';
  _empty?: Maybe<Scalars['String']['output']>;
  authentications: Array<Authentication>;
  origin?: Maybe<Origin>;
  originPage: Array<Origin>;
  user: User;
};


export type QueryOriginArgs = {
  input: OriginInput;
};


export type QueryOriginPageArgs = {
  input: OriginPageInput;
};


export type QueryUserArgs = {
  input: UserInput;
};

export type Resource = Handle & {
  __typename?: 'Resource';
  _id?: Maybe<Scalars['String']['output']>;
  batchResources: Array<Resource>;
  handles: Array<Resource>;
  id: Scalars['String']['output'];
  isBatch?: Maybe<Scalars['Boolean']['output']>;
  origin: Scalars['String']['output'];
  uri: Scalars['Uri']['output'];
  url?: Maybe<Scalars['String']['output']>;
};

export type Subscription = {
  __typename?: 'Subscription';
  _empty?: Maybe<Scalars['String']['output']>;
  episode?: Maybe<Episode>;
  episodePage?: Maybe<EpisodePage>;
  media?: Maybe<Media>;
  mediaPage?: Maybe<MediaPage>;
  playbackSource?: Maybe<PlaybackSource>;
  playbackSourcePage?: Maybe<PlaybackSourcePage>;
  userMediaPage?: Maybe<UserMediaPage>;
};


export type SubscriptionEpisodeArgs = {
  input?: InputMaybe<EpisodeInput>;
};


export type SubscriptionEpisodePageArgs = {
  input?: InputMaybe<EpisodePageInput>;
};


export type SubscriptionMediaArgs = {
  input: MediaInput;
};


export type SubscriptionMediaPageArgs = {
  input: MediaPageInput;
};


export type SubscriptionPlaybackSourceArgs = {
  input?: InputMaybe<PlaybackSourceInput>;
};


export type SubscriptionPlaybackSourcePageArgs = {
  input?: InputMaybe<PlaybackSourcePageInput>;
};


export type SubscriptionUserMediaPageArgs = {
  input: UserMediaPageInput;
};

export type Team = Handle & {
  __typename?: 'Team';
  _id?: Maybe<Scalars['String']['output']>;
  handles: Array<Team>;
  id: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  origin: Scalars['String']['output'];
  uri: Scalars['Uri']['output'];
  url?: Maybe<Scalars['String']['output']>;
};

export type UpdateUserMediaInput = {
  authentications: Array<UserMediaPageInputAuthentication>;
  isRewatching?: InputMaybe<Scalars['Boolean']['input']>;
  mediaUri: Scalars['Uri']['input'];
  origin: Scalars['String']['input'];
  progress?: InputMaybe<Scalars['Int']['input']>;
  rewatchCount?: InputMaybe<Scalars['Int']['input']>;
  score?: InputMaybe<Scalars['Float']['input']>;
  status?: InputMaybe<UserMediaStatus>;
};

export type User = {
  __typename?: 'User';
  avatar?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  username: Scalars['String']['output'];
};

export type UserInput = {
  oauth2?: InputMaybe<UserInputOauth2>;
  origin: Scalars['String']['input'];
  type: AuthenticationMethodType;
};

export type UserInputOauth2 = {
  accessToken: Scalars['String']['input'];
  tokenType: Scalars['String']['input'];
};

export type UserMedia = {
  __typename?: 'UserMedia';
  _id?: Maybe<Scalars['String']['output']>;
  episodes: Array<UserMediaEpisode>;
  handles: Array<Media>;
  id: Scalars['String']['output'];
  isRewatching?: Maybe<Scalars['Boolean']['output']>;
  media: Media;
  origin: Scalars['String']['output'];
  progress?: Maybe<Scalars['Int']['output']>;
  rewatchCount?: Maybe<Scalars['Int']['output']>;
  score?: Maybe<Scalars['Float']['output']>;
  status: UserMediaStatus;
  updatedAt?: Maybe<Scalars['Float']['output']>;
  uri: Scalars['Uri']['output'];
  url?: Maybe<Scalars['String']['output']>;
};

export type UserMediaEpisode = {
  __typename?: 'UserMediaEpisode';
  episode: Episode;
  origin: Origin;
  progress?: Maybe<Scalars['Float']['output']>;
  uri: Scalars['Uri']['output'];
  watched: Scalars['Boolean']['output'];
};

export type UserMediaInput = {
  authentications: Array<UserMediaPageInputAuthentication>;
  uri: Scalars['Uri']['input'];
};

export type UserMediaPage = {
  __typename?: 'UserMediaPage';
  /** The current page */
  currentPageCursor?: Maybe<Scalars['String']['output']>;
  /** The first page */
  firstPageCursor?: Maybe<Scalars['String']['output']>;
  /** Total number of items on the current page */
  inPage?: Maybe<Scalars['Int']['output']>;
  /** The last page cursor */
  lastPageCursor?: Maybe<Scalars['String']['output']>;
  /** The current page */
  nextPageCursor?: Maybe<Scalars['String']['output']>;
  /** The media page nodes */
  nodes: Array<UserMedia>;
  /** The current page */
  previousPageCursor?: Maybe<Scalars['String']['output']>;
  /** The total number of items. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  total?: Maybe<Scalars['Int']['output']>;
  /** Total number of items after the current page. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  totalAfter?: Maybe<Scalars['Int']['output']>;
  /** Total number of items before the current page. Note: This value is not guaranteed to be accurate, do not rely on this for logic */
  totalBefore?: Maybe<Scalars['Int']['output']>;
};

export type UserMediaPageInput = {
  authentications: Array<UserMediaPageInputAuthentication>;
  status?: InputMaybe<Array<UserMediaStatus>>;
};

export type UserMediaPageInputAuthentication = {
  oauth2?: InputMaybe<UserInputOauth2>;
  origin: Scalars['String']['input'];
  type: AuthenticationMethodType;
};

/** The current releasing status of the media */
export enum UserMediaStatus {
  /** Has completed */
  Completed = 'COMPLETED',
  /** Dropped */
  Dropped = 'DROPPED',
  /** Put on hold */
  OnHold = 'ON_HOLD',
  /** Planning to watch */
  PlanToWatch = 'PLAN_TO_WATCH',
  /** Currently watching */
  Watching = 'WATCHING'
}
