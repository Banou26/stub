import type { TraceBundle, TraceFill } from './trace'
import type { TraceRef } from './model'

import { css } from '@emotion/react'

import { isActive, resolveSupports } from './model'
import { gapLabel, refSummary } from './inspector'
import { Value } from './value'

/**
 * The episodes the cluster resolved to, and the episode level edges that put them there.
 *
 * One row per SLOT, in the cluster's own order, never re-sorted: the order is a fact about the
 * cluster and sorting it here would hide a slot that came out in the wrong place. Each filling
 * episode names its origin and the rule that filled it (`via`), and a fill derived from a pairing
 * shows the EPISODE_LINK its `supports` names, which is what proves an `aligned` fill.
 *
 * A fill whose `via` names a derivation but carries no supports is called out rather than tidied
 * away: that is a hole in the trail, and this page exists to show holes.
 */

const style = css`
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 1.2rem;
  }

  th, td {
    padding: 0.35rem 0.6rem 0.35rem 0;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  thead th {
    font-size: 1.1rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.45);
  }

  td.uri, td.slot { font-family: monospace; overflow-wrap: anywhere; }

  .fill {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.15rem 0;
  }
  .fill .uri { font-family: monospace; color: #fff; }
  .fill .via { color: rgb(147, 197, 253); }
  .fill .by { color: rgba(255, 255, 255, 0.5); }

  .proof { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; font-size: 1.15rem; }
  .proof .pair { font-family: monospace; color: rgba(255, 255, 255, 0.75); }
  .proof .missing { color: rgb(250, 204, 21); }

  button {
    padding: 0.1rem 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 0.3rem;
    background: transparent;
    color: inherit;
    font-size: 1.1rem;
    cursor: pointer;
  }
  button:hover { border-color: rgba(255, 255, 255, 0.5); color: #fff; }

  tr.selected > td { background: rgba(61, 180, 242, 0.12); }
  .status.active { color: rgb(74, 222, 128); }
  .status.refused { color: rgb(248, 113, 113); }
  .empty { color: rgba(255, 255, 255, 0.5); font-size: 1.2rem; }
`

/** What proved one fill: the rows its supports name, each one selectable in the inspector. */
const Proof = ({ fill, index, onSelect }: {
  fill: TraceFill
  index: Map<string, TraceRef>
  onSelect: (key: string) => void
}) => {
  const supports = resolveSupports(index, fill.supports)
  if (supports.length === 0) {
    return (
      <div className="proof">
        <span className="missing" data-no-proof>{`${fill.via} names no proving pair`}</span>
      </div>
    )
  }
  return (
    <>
      {supports.map(support => {
        const row = support.ref?.kind === 'episode-link' ? support.ref.row : undefined
        return (
          <div className="proof" key={support.key}>
            <button type="button" onClick={() => onSelect(support.key)}>Inspect</button>
            {
              row
                ? (
                  <span className="pair">
                    {`${row.fromUri} #${row.fromNumber ?? 'null'} to ${row.toUri} #${row.toNumber ?? 'null'}`}
                  </span>
                )
                : (
                  <span className="pair">
                    {
                      support.ref
                        ? `${refSummary(support.ref)} ${support.key}`
                        : (
                          // TWO different findings, and they are not interchangeable: a key this
                          // bundle does not carry is a gap in the bundle, a string that is not a key
                          // at all is a gap in whatever wrote it (`plugin:title` folds a title into
                          // `LINK.supports`, where the schema declares edge keys).
                          <span className="missing">{`${support.key}: ${gapLabel(support.gap!)}`}</span>
                        )
                    }
                  </span>
                )
            }
            {row && <span className={`status ${isActive(row.status) ? 'active' : 'refused'}`}>{row.status}</span>}
          </div>
        )
      })}
    </>
  )
}

const Episodes = ({ bundle, index, selected, onSelect }: {
  bundle: TraceBundle
  index: Map<string, TraceRef>
  selected: string | undefined
  onSelect: (key: string) => void
}) => (
  <div css={style} data-episodes>
    {
      (bundle.episodes ?? []).length === 0
        ? <p className="empty">This cluster holds no slots.</p>
        : (
          <table data-slots>
            <thead>
              <tr>
                <th>slot</th>
                <th>number</th>
                <th>title</th>
                <th>fills</th>
              </tr>
            </thead>
            <tbody>
              {bundle.episodes.map(slot => (
                <tr key={slot.slotId} data-slot={slot.slotId}>
                  <td className="slot">{slot.slotId}</td>
                  <td><Value value={slot.number}/></td>
                  <td><Value value={slot.title}/></td>
                  <td>
                    {
                      slot.fills.length === 0
                        ? <span className="empty">nothing fills this slot</span>
                        : slot.fills.map(fill => (
                          <div key={`${fill.episodeUri}\u0000${fill.via}`} data-fill={fill.episodeUri}>
                            <div className="fill">
                              <span className="uri">{fill.episodeUri}</span>
                              <span>#<Value value={fill.number}/></span>
                              <span>{fill.origin}</span>
                              <span className="via">{fill.via}</span>
                              <span className="by">{fill.by}</span>
                            </div>
                            <Proof fill={fill} index={index} onSelect={onSelect}/>
                          </div>
                        ))
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
    }
    <h3>Episode edges</h3>
    {
      (bundle.episodeLinks ?? []).length === 0
        ? <p className="empty">No episode links, refused or otherwise.</p>
        : (
          <table data-episode-links>
            <thead>
              <tr>
                <th>from</th>
                <th>to</th>
                <th>kind</th>
                <th>status</th>
                <th>by</th>
                <th>rule</th>
                <th/>
              </tr>
            </thead>
            <tbody>
              {bundle.episodeLinks.map(link => (
                <tr
                  key={link.key}
                  data-episode-link={link.key}
                  data-status={link.status}
                  className={selected === link.key ? 'selected' : undefined}
                >
                  <td className="uri">{`${link.fromUri} #${link.fromNumber ?? 'null'}`}</td>
                  <td className="uri">{`${link.toUri} #${link.toNumber ?? 'null'}`}</td>
                  <td>{link.kind}</td>
                  <td><span className={`status ${isActive(link.status) ? 'active' : 'refused'}`}>{link.status}</span></td>
                  <td>{link.by}</td>
                  <td>{link.reason}</td>
                  <td><button type="button" onClick={() => onSelect(link.key)}>Inspect</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
    }
    <h3>Episode claims</h3>
    {
      (bundle.episodeClaims ?? []).length === 0
        ? <p className="empty">no episode level claims</p>
        : (
          <table data-episode-claims>
            <thead>
              <tr><th>from</th><th>to</th><th>kind</th><th>claimer</th><th>provenance</th><th>answer</th><th/></tr>
            </thead>
            <tbody>
              {bundle.episodeClaims.map(claim => (
                <tr
                  key={claim.key}
                  data-episode-claim={claim.key}
                  className={selected === claim.key ? 'selected' : undefined}
                >
                  <td className="uri">{claim.fromUri}</td>
                  <td className="uri">{claim.toUri}</td>
                  <td>{claim.kind}</td>
                  <td>{claim.claimer}</td>
                  <td>{claim.provenance}</td>
                  <td>{claim.answerSeq}</td>
                  <td><button type="button" onClick={() => onSelect(claim.key)}>Inspect</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
    }
  </div>
)

export default Episodes
