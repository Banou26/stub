import type { GetMediaModalSubscription } from '../generated/graphql'

import { css } from '@emotion/react'
import { Link } from 'wouter'

import { getRoutePath, Route } from '../router/path'
import { relationLabel, relationRank, workFormatLabel } from '../utils/relation-labels'
import { statusLabel } from '../router/search/params'
import { useCoverUrl } from '../utils/use-cover-url'

/**
 * The works a media is related to as a story, as a row of cards.
 *
 * A GRID rather than the home page's carousel. A relation set is small (a handful of entries, not a
 * season's worth), so there is nothing to virtualize, and the carousel drags in `Draggable`, which
 * binds mousedown, mousemove and mouseup on `globalThis` and calls `preventDefault`. Inside a modal
 * that already locks the body and hosts a watch party's scroll box, that is a real cost for a row
 * that fits on screen anyway.
 */

export type RelationEdge = NonNullable<GetMediaModalSubscription['media']>['relations'][number]

const style = css`
  margin-top: 4rem;

  & > .heading {
    font-size: 1.8rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 1.5rem;
  }

  & > .grid {
    display: grid;
    /* auto-fill, so a franchise with two entries does not stretch two cards across the modal */
    grid-template-columns: repeat(auto-fill, minmax(28rem, 1fr));
    gap: 1.2rem;
  }
`

const cardStyle = css`
  display: flex;
  align-items: stretch;
  gap: 1.2rem;
  padding: 0;
  border-radius: 0.6rem;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
  color: inherit;
  text-decoration: none;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  & > .cover {
    flex-shrink: 0;
    width: 6rem;
    /* the aspect every cover in this app is, so a missing image leaves a hole the right shape */
    aspect-ratio: 2 / 3;
    object-fit: cover;
    background-color: rgb(35, 35, 35);
    pointer-events: none;
  }

  & > .body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.4rem;
    padding: 1rem 1.2rem 1rem 0;
    min-width: 0;
  }

  & .relation {
    font-size: 1.3rem;
    font-weight: 700;
    /* the one accented thing on the card: it is what the reader is scanning for */
    color: rgb(61, 180, 242);
  }

  & .title {
    font-size: 1.5rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    /* two lines then ellipsis: a light novel title runs long and a ragged card height is worse */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  & .meta {
    font-size: 1.25rem;
    color: rgba(255, 255, 255, 0.55);
  }
`

const RelationCard = ({ edge }: { edge: RelationEdge }) => {
  const cover = useCoverUrl(edge.node.covers)
  const title = edge.node.titles?.at(0)?.title
  // `format` rides on the EDGE rather than the node because `MediaType` is anime formats only and a
  // franchise's relations are mostly not anime. See the schema's own note on the field.
  const meta = [workFormatLabel(edge.format), statusLabel(edge.node.status)].filter(Boolean).join(' · ')

  return (
    <Link className="relation-card" css={cardStyle} to={getRoutePath(Route.MEDIA, { uri: edge.node.uri })}>
      {cover ? <img className="cover" src={cover} alt=""/> : <div className="cover"/>}
      <div className="body">
        <div className="relation">{relationLabel(edge.relation)}</div>
        <div className="title">{title ?? edge.node.uri}</div>
        {meta ? <div className="meta">{meta}</div> : undefined}
      </div>
    </Link>
  )
}

/**
 * Sorted by what the relation IS rather than by what the source happened to return first, so the
 * source novel and the sequel sit at the top of every page instead of wherever AniList put them.
 * Ties keep their arrival order, which is at least stable between renders.
 */
export const sortRelations = (edges: readonly RelationEdge[]): RelationEdge[] =>
  [...edges].sort((a, b) => relationRank(a.relation) - relationRank(b.relation))

const MediaRelations = ({ relations }: { relations: readonly RelationEdge[] }) => {
  // Nothing at all rather than an empty heading: only some sources name relations, so most media have
  // none and a "Relations" heading over blank space reads as a page that failed to load.
  if (!relations.length) return null

  return (
    <div css={style} data-relations>
      <div className="heading">Relations</div>
      <div className="grid">
        {sortRelations(relations).map(edge => <RelationCard key={`${edge.relation}:${edge.node.uri}`} edge={edge}/>)}
      </div>
    </div>
  )
}

export default MediaRelations
